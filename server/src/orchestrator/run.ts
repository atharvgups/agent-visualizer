import { randomUUID } from "node:crypto";
import {
  GateItem,
  NodeStatus,
  Plan,
  PlanNode,
  RunEvent,
  moveGateMutation,
  applyPlanMutation,
  validatePlanGraph,
} from "@agent-viz/shared";
import {
  CandidateEvent,
  DraftApplication,
  draftApplication,
  mulberry32,
  searchEvents,
} from "./tools";
import { extractTopic } from "../planner/domainPlanner";

/**
 * Executes a plan-as-data JSON graph. The plan object the UI renders is the
 * same object this orchestrator walks — it can only deviate by emitting a
 * plan_amendment event carrying an explicit mutation, reason, and evidence.
 */

const SPEED = Math.max(0.1, Number(process.env.SIM_SPEED ?? "1"));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / SPEED));

const TERMINAL: NodeStatus[] = ["done", "failed", "killed"];

/** Share of verified findings that must be Chinese-language before the
 * orchestrator amends the plan with a Chinese social discovery branch. */
const ZH_AMENDMENT_THRESHOLD = 0.3;

class BranchKilledError extends Error {}

type Subscriber = (ev: RunEvent) => void;

/** Omit that distributes over each member of the event union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEvent = DistributiveOmit<RunEvent, "id" | "ts" | "seq">;

export interface GateDecision {
  itemId: string;
  action: "approved" | "edited" | "rejected";
  editedContent?: string;
}

export class Run {
  readonly id: string;
  plan: Plan;
  readonly events: RunEvent[] = [];
  private seq = 0;
  private subscribers = new Set<Subscriber>();
  private status = new Map<string, NodeStatus>();
  private outputs = new Map<string, unknown>();
  private pausedBranches = new Set<string>();
  private killedBranches = new Set<string>();
  private started = new Set<string>();
  private gateResolver: ((decisions: GateDecision[]) => void) | null = null;
  private approved = false;
  private finished = false;
  private zhAmendmentEmitted = false;
  private rng: () => number;

  constructor(plan: Plan) {
    this.id = plan.id;
    this.plan = plan;
    this.rng = mulberry32(hashString(plan.id));
    for (const n of plan.nodes) this.status.set(n.id, "proposed");
    this.emit({ type: "plan_proposed", tier: "structural", plan });
  }

  // ---- event bus ----

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private emit(ev: NewEvent): void {
    const full = { ...ev, id: randomUUID(), ts: Date.now(), seq: this.seq++ } as RunEvent;
    this.events.push(full);
    for (const fn of this.subscribers) fn(full);
  }

  private setStatus(nodeId: string, status: NodeStatus): void {
    if (this.status.get(nodeId) === status) return;
    this.status.set(nodeId, status);
    this.emit({ type: "node_status", tier: "operational", nodeId, status });
  }

  // ---- interventions (all land on the same bus) ----

  approve(): void {
    if (this.approved) throw new Error("plan already approved");
    this.approved = true;
    this.emit({ type: "intervention", tier: "structural", action: "approve_plan" });
    this.emit({ type: "plan_approved", tier: "structural" });
    for (const n of this.plan.nodes) this.setStatus(n.id, "pending");
    void this.tick();
  }

  /** One pre-approval graph edit: drag the review gate to a new position. */
  moveGate(gateId: string, afterNodeId: string): void {
    if (this.approved) throw new Error("gate can only be moved before approval");
    const gate = this.plan.nodes.find((n) => n.id === gateId);
    if (!gate || gate.kind !== "human_gate") throw new Error("not a human gate");
    if (!this.plan.nodes.some((n) => n.id === afterNodeId)) throw new Error("unknown anchor node");
    const mutation = moveGateMutation(this.plan, gateId, afterNodeId);
    const next = applyPlanMutation(this.plan, mutation);
    const errors = validatePlanGraph(next);
    if (errors.length > 0) throw new Error(`gate move would break the plan: ${errors.join("; ")}`);
    this.plan = next;
    this.emit({
      type: "intervention",
      tier: "structural",
      action: "move_gate",
      nodeId: gateId,
      afterNodeId,
      mutation,
    });
  }

  pauseBranch(branch: string): void {
    this.assertBranch(branch);
    this.pausedBranches.add(branch);
    this.emit({ type: "intervention", tier: "structural", action: "pause_branch", branch });
  }

  resumeBranch(branch: string): void {
    this.assertBranch(branch);
    this.pausedBranches.delete(branch);
    this.emit({ type: "intervention", tier: "structural", action: "resume_branch", branch });
    void this.tick();
  }

  killBranch(branch: string): void {
    this.assertBranch(branch);
    this.killedBranches.add(branch);
    this.emit({ type: "intervention", tier: "structural", action: "kill_branch", branch });
    void this.tick();
  }

  editInstructions(nodeId: string, instructions: string): void {
    const node = this.plan.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error("unknown node");
    this.plan = {
      ...this.plan,
      nodes: this.plan.nodes.map((n) => (n.id === nodeId ? { ...n, instructions } : n)),
    };
    this.emit({
      type: "intervention",
      tier: "structural",
      action: "edit_instructions",
      nodeId,
      instructions,
    });
  }

  resolveGate(decisions: GateDecision[]): void {
    if (!this.gateResolver) throw new Error("no gate is waiting");
    const resolve = this.gateResolver;
    this.gateResolver = null;
    resolve(decisions);
  }

  private assertBranch(branch: string): void {
    if (!this.plan.nodes.some((n) => n.branch === branch)) throw new Error("unknown branch");
  }

  // ---- scheduler ----

  private node(id: string): PlanNode {
    const n = this.plan.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`node vanished from plan: ${id}`);
    return n;
  }

  private upstream(nodeId: string): string[] {
    return this.plan.edges.filter((e) => e.target === nodeId).map((e) => e.source);
  }

  private async tick(): Promise<void> {
    if (!this.approved || this.finished) return;
    for (const n of [...this.plan.nodes]) {
      const st = this.status.get(n.id) ?? "pending";
      if (TERMINAL.includes(st) || this.started.has(n.id)) continue;
      if (this.killedBranches.has(n.branch)) {
        this.setStatus(n.id, "killed");
        continue;
      }
      const ups = this.upstream(n.id);
      const upStatuses = ups.map((u) => this.status.get(u) ?? "pending");
      const allTerminal = upStatuses.every((s) => TERMINAL.includes(s));
      if (!allTerminal) continue;
      if (ups.length > 0 && !upStatuses.includes("done")) {
        // every input died — this node can never produce anything real
        this.setStatus(n.id, "killed");
        continue;
      }
      if (this.pausedBranches.has(n.branch)) continue;
      this.started.add(n.id);
      void this.runNode(n.id);
    }
    this.maybeFinish();
  }

  private maybeFinish(): void {
    if (this.finished) return;
    const allTerminal = this.plan.nodes.every((n) =>
      TERMINAL.includes(this.status.get(n.id) ?? "pending")
    );
    if (!allTerminal) return;
    this.finished = true;
    const done = this.plan.nodes.filter((n) => this.status.get(n.id) === "done").length;
    const killed = this.plan.nodes.filter((n) => this.status.get(n.id) === "killed").length;
    this.emit({
      type: "run_finished",
      tier: "structural",
      outcome: done > 0 ? "completed" : "aborted",
      summary: `${done} step(s) completed${killed ? `, ${killed} killed` : ""}. The map above is the audit trail of what actually ran.`,
    });
  }

  /** Cooperative checkpoint inside workers: honors pause and kill mid-run. */
  private async checkpoint(nodeId: string): Promise<void> {
    const branch = this.node(nodeId).branch;
    if (this.killedBranches.has(branch)) throw new BranchKilledError();
    while (this.pausedBranches.has(branch)) {
      this.setStatus(nodeId, "paused");
      await sleep(150);
      if (this.killedBranches.has(branch)) throw new BranchKilledError();
    }
    if (this.status.get(nodeId) === "paused") this.setStatus(nodeId, "running");
  }

  private async runNode(nodeId: string): Promise<void> {
    try {
      this.setStatus(nodeId, "running");
      await this.checkpoint(nodeId);
      const node = this.node(nodeId);
      const worker = WORKERS[node.kind];
      const output = await worker(this, node);
      this.outputs.set(nodeId, output);
      this.setStatus(nodeId, "done");
      this.maybeAmendForChineseSources(node);
    } catch (err) {
      if (err instanceof BranchKilledError) {
        this.setStatus(nodeId, "killed");
      } else {
        this.setStatus(nodeId, "failed");
        this.emit({
          type: "node_output",
          tier: "operational",
          nodeId,
          summary: "This step failed.",
          raw: String(err),
        });
      }
    }
    void this.tick();
  }

  // ---- the amendment path: contract-honest deviation ----

  /**
   * After a research step completes, the orchestrator inspects the actual
   * verified findings. If a large share came from Chinese-language sources
   * and the plan has no Chinese social branch, it amends the plan — with the
   * measured share as evidence. This is a real decision on worker output,
   * not a scripted animation.
   */
  private maybeAmendForChineseSources(completed: PlanNode): void {
    if (this.zhAmendmentEmitted) return;
    if (completed.kind !== "transform" && completed.kind !== "source") return;
    const findings = this.allVerifiedFindings();
    if (findings.length < 5) return;
    const zhShare = findings.filter((f) => f.language === "zh").length / findings.length;
    if (zhShare < ZH_AMENDMENT_THRESHOLD) return;
    const mergeNode = this.plan.nodes.find((n) => n.kind === "store" && this.upstream(n.id).length > 1);
    if (!mergeNode) return;
    this.zhAmendmentEmitted = true;
    const pct = Math.round(zhShare * 100);
    const newNode: PlanNode = {
      id: "zh-social-dive",
      kind: "source",
      label: "Chinese social deep-dive",
      summary: "Search Xiaohongshu and WeChat directly — a large share of verified events only surface there.",
      instructions:
        "Search Xiaohongshu and WeChat official accounts for side-event announcements; verify against organizer accounts before keeping.",
      agent: "social-research",
      branch: "social-research",
    };
    const mutation = {
      addNodes: [newNode],
      addEdges: [
        { id: "e-zh-in", source: completed.id, target: newNode.id, label: `${pct}% zh sources` },
        { id: "e-zh-merge", source: newNode.id, target: mergeNode.id },
      ],
      removeNodeIds: [],
      removeEdgeIds: [],
    };
    this.plan = applyPlanMutation(this.plan, mutation);
    this.status.set(newNode.id, "pending");
    this.emit({
      type: "plan_amendment",
      tier: "structural",
      change: "New branch: Chinese social discovery",
      reason:
        "Verified findings are disproportionately announced on Chinese-language platforms; the current branches would miss them.",
      evidence: `${pct}% of verified events so far came from Chinese-language sources (${findings.length} verified findings inspected).`,
      mutation,
    });
    void this.tick();
  }

  private allVerifiedFindings(): CandidateEvent[] {
    const out: CandidateEvent[] = [];
    for (const v of this.outputs.values()) {
      if (Array.isArray(v) && v.length > 0 && isCandidateItem(v[0])) {
        out.push(...(v as CandidateEvent[]).filter((c) => c.verified));
      }
    }
    return out;
  }

  // ---- worker helpers ----

  progress(nodeId: string, counters: Record<string, number>, note?: string): void {
    this.emit({ type: "node_progress", tier: "operational", nodeId, counters, note });
  }

  output(nodeId: string, summary: string, raw: string): void {
    this.emit({ type: "node_output", tier: "operational", nodeId, summary, raw });
  }

  upstreamOutputs(nodeId: string): unknown[] {
    return this.upstream(nodeId)
      .filter((u) => this.status.get(u) === "done")
      .map((u) => this.outputs.get(u))
      .filter((v) => v !== undefined);
  }

  getRng(): () => number {
    return this.rng;
  }

  async workSleep(nodeId: string, ms: number): Promise<void> {
    await sleep(ms);
    await this.checkpoint(nodeId);
  }

  openGate(nodeId: string, items: GateItem[]): Promise<GateDecision[]> {
    this.setStatus(nodeId, "blocked");
    this.emit({ type: "gate_opened", tier: "structural", nodeId, items });
    return new Promise((resolve) => {
      this.gateResolver = resolve;
    });
  }

  emitGateResolved(nodeId: string, decisions: GateDecision[], preferenceNote?: string): void {
    this.emit({
      type: "gate_resolved",
      tier: "structural",
      nodeId,
      decisions,
      preferenceNote,
    });
  }

  currentInstructions(nodeId: string): string {
    return this.node(nodeId).instructions;
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- workers by ontology kind ----

type Worker = (run: Run, node: PlanNode) => Promise<unknown>;

const sourceWorker: Worker = async (run, node) => {
  const rng = run.getRng();
  const topic = extractTopic(run.plan.prompt);
  const channel = node.agent.includes("social")
    ? "social"
    : node.agent.includes("platform")
      ? "platform"
      : "web";
  const total = channel === "web" ? 40 + Math.floor(rng() * 20) : 15 + Math.floor(rng() * 15);
  const all = searchEvents({ rng, topic, channel, count: total });
  let found = 0;
  while (found < total) {
    await run.workSleep(node.id, 500);
    found = Math.min(total, found + 5 + Math.floor(rng() * 8));
    run.progress(node.id, { found });
  }
  run.output(
    node.id,
    `Found ${total} candidate items via ${channel}.`,
    JSON.stringify(all.slice(0, 10), null, 2)
  );
  return all;
};

const transformWorker: Worker = async (run, node) => {
  const rng = run.getRng();
  const inputs = run.upstreamOutputs(node.id).flat() as unknown[];
  const candidates = inputs.filter(isCandidateItem);
  if (candidates.length === 0) {
    // generic transform (e.g. trivial plan): just do the work
    await run.workSleep(node.id, 1200);
    run.output(node.id, "Task completed.", node.instructions);
    return { done: true };
  }
  let reviewed = 0;
  const verified: CandidateEvent[] = [];
  while (reviewed < candidates.length) {
    await run.workSleep(node.id, 450);
    const batch = Math.min(candidates.length - reviewed, 4 + Math.floor(rng() * 6));
    for (let i = 0; i < batch; i++) {
      const c = candidates[reviewed + i] as CandidateEvent;
      if (c.verified) verified.push(c);
    }
    reviewed += batch;
    run.progress(node.id, { reviewed, verified: verified.length });
  }
  run.output(
    node.id,
    `Verified ${verified.length} of ${reviewed} candidates.`,
    JSON.stringify(verified, null, 2)
  );
  return verified;
};

const storeWorker: Worker = async (run, node) => {
  const inputs = run.upstreamOutputs(node.id).flat() as unknown[];
  const candidates = inputs.filter(isCandidateItem) as CandidateEvent[];
  const drafts = inputs.filter(isDraftItem) as DraftApplication[];
  await run.workSleep(node.id, 800);
  if (drafts.length > 0) {
    run.progress(node.id, { packaged: drafts.length });
    run.output(
      node.id,
      `Packaged ${drafts.length} approved application(s), ready to submit.`,
      drafts.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")
    );
    return drafts;
  }
  const seen = new Set<string>();
  const merged = candidates.filter((c) => {
    const key = `${c.name}|${c.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  run.progress(node.id, { merged: merged.length });
  run.output(node.id, `Merged ${merged.length} unique verified item(s).`, JSON.stringify(merged, null, 2));
  return merged;
};

const decisionWorker: Worker = async (run, node) => {
  const rng = run.getRng();
  const inputs = run.upstreamOutputs(node.id).flat() as unknown[];
  const candidates = inputs.filter(isCandidateItem) as CandidateEvent[];
  await run.workSleep(node.id, 900);
  const ranked = [...candidates].sort(() => rng() - 0.5);
  const selected = ranked.slice(0, Math.min(3, ranked.length));
  run.progress(node.id, { ranked: candidates.length, selected: selected.length });
  run.output(
    node.id,
    `Selected top ${selected.length} of ${candidates.length} by fit and effort.`,
    JSON.stringify(selected, null, 2)
  );
  return selected;
};

const loopWorker: Worker = async (run, node) => {
  const inputs = run.upstreamOutputs(node.id).flat() as unknown[];
  const selected = inputs.filter(isCandidateItem) as CandidateEvent[];
  const spec = run.plan.loops.find((l) => l.nodeId === node.id);
  const iterations = Math.min(selected.length || 3, spec?.maxIterations ?? 3);
  const drafts: DraftApplication[] = [];
  for (let i = 0; i < iterations; i++) {
    await run.workSleep(node.id, 900);
    // instructions re-read each pass so mid-run edits apply on the next loop
    const instructions = run.currentInstructions(node.id);
    const event =
      selected[i] ??
      ({ name: `Item ${i + 1}`, date: "", organizer: "unknown", language: "en", verified: true, source: "n/a" } as CandidateEvent);
    drafts.push(draftApplication({ event, index: i + 1, instructions }));
    run.progress(node.id, { drafts: drafts.length }, `Drafting ${i + 1} of ${iterations}`);
  }
  run.output(
    node.id,
    `Drafted ${drafts.length} application(s).`,
    drafts.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")
  );
  return drafts;
};

const humanGateWorker: Worker = async (run, node) => {
  const inputs = run.upstreamOutputs(node.id).flat() as unknown[];
  const drafts = inputs.filter(isDraftItem) as DraftApplication[];
  const items: GateItem[] =
    drafts.length > 0
      ? drafts.map((d) => ({ id: d.id, title: d.title, content: d.content }))
      : [{ id: "result", title: "Result", content: JSON.stringify(inputs, null, 2) }];
  const decisions = await run.openGate(node.id, items);
  const kept: DraftApplication[] = [];
  let edited = 0;
  for (const d of decisions) {
    if (d.action === "rejected") continue;
    const original = items.find((i) => i.id === d.itemId);
    if (!original) continue;
    if (d.action === "edited") edited++;
    kept.push({
      id: d.itemId,
      title: original.title,
      content: d.action === "edited" && d.editedContent ? d.editedContent : original.content,
    });
  }
  const preferenceNote =
    edited > 0
      ? `User edited ${edited} draft(s) — future drafts should follow the edited versions' tone and structure.`
      : undefined;
  run.emitGateResolved(node.id, decisions, preferenceNote);
  run.output(
    node.id,
    `You approved ${kept.length} of ${items.length} item(s).`,
    kept.map((d) => `## ${d.title}\n${d.content}`).join("\n\n")
  );
  return kept;
};

function isCandidateItem(v: unknown): v is CandidateEvent {
  return typeof v === "object" && v !== null && "language" in v && "verified" in v;
}

function isDraftItem(v: unknown): v is DraftApplication {
  return typeof v === "object" && v !== null && "content" in v && "title" in v && "id" in v;
}

const WORKERS: Record<PlanNode["kind"], Worker> = {
  source: sourceWorker,
  transform: transformWorker,
  store: storeWorker,
  decision: decisionWorker,
  loop: loopWorker,
  human_gate: humanGateWorker,
};
