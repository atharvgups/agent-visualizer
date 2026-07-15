import { beforeAll, describe, expect, it } from "vitest";
import { RunEvent, reduceEvents } from "@agent-viz/shared";

process.env.SIM_SPEED = "60"; // fast simulation for tests

// dynamic imports so SIM_SPEED is set before module load
const mods = async () => {
  const { Run } = await import("./run");
  const { buildPlan } = await import("../planner/domainPlanner");
  return { Run, buildPlan };
};

type RunT = InstanceType<Awaited<ReturnType<typeof mods>>["Run"]>;

function waitFor(run: RunT, type: RunEvent["type"], timeoutMs = 20000): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const existing = run.events.find((e) => e.type === type);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const unsub = run.subscribe((ev) => {
      if (ev.type === type) {
        clearTimeout(timer);
        unsub();
        resolve(ev);
      }
    });
  });
}

describe("orchestrator", () => {
  let Run: Awaited<ReturnType<typeof mods>>["Run"];
  let buildPlan: Awaited<ReturnType<typeof mods>>["buildPlan"];

  beforeAll(async () => {
    ({ Run, buildPlan } = await mods());
  });

  it("executes the full ChinaJoy demo: amendment, gate, finish", async () => {
    const plan = buildPlan("test-run-1", "Research every ChinaJoy side event and prep applications");
    const run = new Run(plan);
    expect(run.events[0].type).toBe("plan_proposed");

    run.approve();

    // the money moment: orchestrator amends the plan based on measured data
    const amendment = await waitFor(run, "plan_amendment");
    if (amendment.type !== "plan_amendment") throw new Error("unreachable");
    expect(amendment.mutation.addNodes[0].id).toBe("zh-social-dive");
    expect(amendment.evidence).toMatch(/\d+% of verified events/);

    // human gate blocks execution until decisions arrive
    const gate = await waitFor(run, "gate_opened");
    if (gate.type !== "gate_opened") throw new Error("unreachable");
    expect(gate.items.length).toBeGreaterThan(0);

    run.resolveGate(
      gate.items.map((item, i) => ({
        itemId: item.id,
        action: i === 0 ? ("edited" as const) : ("approved" as const),
        editedContent: i === 0 ? "Edited draft content" : undefined,
      }))
    );

    const resolved = await waitFor(run, "gate_resolved");
    if (resolved.type !== "gate_resolved") throw new Error("unreachable");
    expect(resolved.preferenceNote).toBeTruthy();

    const finished = await waitFor(run, "run_finished");
    if (finished.type !== "run_finished") throw new Error("unreachable");
    expect(finished.outcome).toBe("completed");

    // honest-diagram contract: every executed node exists in the rendered plan
    const state = reduceEvents(run.events);
    const planIds = new Set(state.plan!.nodes.map((n) => n.id));
    for (const ev of run.events) {
      if (ev.type === "node_status") expect(planIds.has(ev.nodeId)).toBe(true);
    }
    // every node in the final map reached a terminal state
    for (const n of state.plan!.nodes) {
      expect(["done", "killed", "failed"]).toContain(state.nodeRuntime[n.id].status);
    }
    // diff noise control: structural events stay in the 5–15 band, not hundreds
    const structural = run.events.filter((e) => e.tier === "structural");
    expect(structural.length).toBeGreaterThanOrEqual(5);
    expect(structural.length).toBeLessThanOrEqual(15);
  }, 30000);

  it("kill branch mid-run terminates its nodes and the run still finishes", async () => {
    const plan = buildPlan("test-run-2", "Research every GamesCom Asia side event and prep applications");
    const run = new Run(plan);
    run.approve();
    await waitFor(run, "node_status"); // execution underway
    run.killBranch("web-research");
    await waitFor(run, "gate_opened");
    const gate = run.events.find((e) => e.type === "gate_opened");
    if (!gate || gate.type !== "gate_opened") throw new Error("no gate");
    run.resolveGate(gate.items.map((i) => ({ itemId: i.id, action: "approved" as const })));
    const finished = await waitFor(run, "run_finished");
    if (finished.type !== "run_finished") throw new Error("unreachable");

    const state = reduceEvents(run.events);
    for (const n of state.plan!.nodes.filter((n) => n.branch === "web-research")) {
      expect(state.nodeRuntime[n.id].status).toBe("killed");
    }
    expect(state.annotations.some((a) => a.title.includes("Branch killed"))).toBe(true);
  }, 30000);

  it("move_gate before approval rewires the executed graph", async () => {
    const plan = buildPlan("test-run-3", "Research every ChinaJoy side event and prep applications");
    const run = new Run(plan);
    run.moveGate("review-gate", "prioritize");
    run.approve();
    const gate = await waitFor(run, "gate_opened");
    if (gate.type !== "gate_opened") throw new Error("unreachable");
    // gate now fires straight after prioritization, before drafting
    const draftStatusBeforeGate = run.events
      .filter((e) => e.type === "node_status" && e.nodeId === "draft-applications")
      .map((e) => (e.type === "node_status" ? e.status : ""));
    expect(draftStatusBeforeGate).not.toContain("done");
    run.resolveGate(gate.items.map((i) => ({ itemId: i.id, action: "approved" as const })));
    await waitFor(run, "run_finished");
  }, 30000);

  it("trivial prompts get a minimal linear plan (complexity gate)", async () => {
    const plan = buildPlan("test-run-4", "Summarize this PDF");
    expect(plan.nodes.length).toBeLessThanOrEqual(3);
    expect(plan.approvalGates).toHaveLength(0);
    const run = new Run(plan);
    run.approve();
    const finished = await waitFor(run, "run_finished");
    if (finished.type !== "run_finished") throw new Error("unreachable");
    expect(finished.outcome).toBe("completed");
  }, 30000);
});
