import { describe, expect, it } from "vitest";
import { Plan, PlanNode } from "./plan";
import { RunEvent } from "./events";
import { reduceEvents } from "./runState";
import { moveGateMutation, applyPlanMutation } from "./interventions";

let seq = 0;
const ev = <T extends Omit<RunEvent, "id" | "ts" | "seq">>(e: T): RunEvent =>
  ({ ...e, id: `ev-${seq}`, ts: 1000 + seq, seq: seq++ }) as unknown as RunEvent;

const node = (id: string, kind: PlanNode["kind"] = "transform", branch = "main"): PlanNode => ({
  id,
  kind,
  label: id,
  summary: "",
  instructions: "original",
  agent: "a",
  branch,
});

const plan = (): Plan => ({
  id: "r1",
  prompt: "test",
  interpretation: "i",
  nodes: [node("a", "source"), node("b"), node("gate", "human_gate"), node("c", "store")],
  edges: [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "gate" },
    { id: "e3", source: "gate", target: "c" },
  ],
  approvalGates: ["gate"],
  loops: [],
});

describe("reduceEvents", () => {
  it("folds propose → approve → execute → finish", () => {
    seq = 0;
    const state = reduceEvents([
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({ type: "node_status", tier: "operational", nodeId: "a", status: "running" }),
      ev({ type: "node_progress", tier: "operational", nodeId: "a", counters: { found: 10 } }),
      ev({ type: "node_progress", tier: "operational", nodeId: "a", counters: { found: 42 } }),
      ev({ type: "node_status", tier: "operational", nodeId: "a", status: "done" }),
      ev({ type: "run_finished", tier: "structural", outcome: "completed", summary: "ok" }),
    ]);
    expect(state.phase).toBe("finished");
    expect(state.nodeRuntime["a"].status).toBe("done");
    expect(state.nodeRuntime["a"].counters.found).toBe(42);
    expect(state.nodeRuntime["b"].status).toBe("pending");
  });

  it("applies amendments to the plan graph and records a reason card", () => {
    seq = 0;
    const added = node("zh", "source", "social");
    const state = reduceEvents([
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({
        type: "plan_amendment",
        tier: "structural",
        change: "New branch",
        reason: "because",
        evidence: "38%",
        mutation: {
          addNodes: [added],
          addEdges: [{ id: "e-zh", source: "a", target: "zh" }],
          removeNodeIds: [],
          removeEdgeIds: [],
        },
      }),
    ]);
    expect(state.plan?.nodes.map((n) => n.id)).toContain("zh");
    expect(state.nodeRuntime["zh"].status).toBe("pending");
    const card = state.annotations.find((a) => a.kind === "amendment");
    expect(card?.evidence).toBe("38%");
  });

  it("replay: a prefix of the log yields the earlier state", () => {
    seq = 0;
    const events = [
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({ type: "node_status", tier: "operational", nodeId: "a", status: "running" }),
      ev({ type: "node_status", tier: "operational", nodeId: "a", status: "done" }),
    ];
    expect(reduceEvents(events.slice(0, 3)).nodeRuntime["a"].status).toBe("running");
    expect(reduceEvents(events).nodeRuntime["a"].status).toBe("done");
  });

  it("tracks paused branches and instruction edits from interventions", () => {
    seq = 0;
    const state = reduceEvents([
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({ type: "intervention", tier: "structural", action: "pause_branch", branch: "main" }),
      ev({
        type: "intervention",
        tier: "structural",
        action: "edit_instructions",
        nodeId: "b",
        instructions: "be terser",
      }),
    ]);
    expect(state.pausedBranches).toEqual(["main"]);
    expect(state.plan?.nodes.find((n) => n.id === "b")?.instructions).toBe("be terser");
    expect(state.annotations.filter((a) => a.kind === "intervention")).toHaveLength(2);
  });

  it("gate open/resolve moves phase and stores the preference note", () => {
    seq = 0;
    const state = reduceEvents([
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({
        type: "gate_opened",
        tier: "structural",
        nodeId: "gate",
        items: [{ id: "d1", title: "Draft", content: "..." }],
      }),
    ]);
    expect(state.phase).toBe("gated");
    expect(state.openGate?.items).toHaveLength(1);

    const resolved = reduceEvents([
      ev({ type: "plan_proposed", tier: "structural", plan: plan() }),
      ev({ type: "plan_approved", tier: "structural" }),
      ev({
        type: "gate_opened",
        tier: "structural",
        nodeId: "gate",
        items: [{ id: "d1", title: "Draft", content: "..." }],
      }),
      ev({
        type: "gate_resolved",
        tier: "structural",
        nodeId: "gate",
        decisions: [{ itemId: "d1", action: "edited", editedContent: "new" }],
        preferenceNote: "tone note",
      }),
    ]);
    expect(resolved.phase).toBe("executing");
    expect(resolved.openGate).toBeNull();
    expect(resolved.nodeRuntime["gate"].preferenceNote).toBe("tone note");
  });
});

describe("moveGateMutation", () => {
  it("splices the gate after the anchor without breaking the DAG", () => {
    const p = plan();
    // move gate from after b to after a
    const mutation = moveGateMutation(p, "gate", "a");
    const next = applyPlanMutation(p, mutation);
    const has = (s: string, t: string) => next.edges.some((e) => e.source === s && e.target === t);
    expect(has("a", "gate")).toBe(true);
    expect(has("gate", "b")).toBe(true);
    expect(has("b", "c")).toBe(true);
    expect(has("b", "gate")).toBe(false);
  });
});
