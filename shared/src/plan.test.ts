import { describe, expect, it } from "vitest";
import { Plan, validatePlanGraph } from "./plan";

const basePlan = (): Plan => ({
  id: "p1",
  prompt: "test",
  interpretation: "test plan",
  nodes: [
    { id: "a", kind: "source", label: "A", summary: "", instructions: "", agent: "x", branch: "b1" },
    { id: "b", kind: "transform", label: "B", summary: "", instructions: "", agent: "x", branch: "b1" },
    { id: "g", kind: "human_gate", label: "G", summary: "", instructions: "", agent: "x", branch: "b1" },
  ],
  edges: [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "g" },
  ],
  approvalGates: ["g"],
  loops: [],
});

describe("validatePlanGraph", () => {
  it("accepts a valid plan", () => {
    expect(validatePlanGraph(basePlan())).toEqual([]);
  });

  it("rejects duplicate node ids", () => {
    const p = basePlan();
    p.nodes.push({ ...p.nodes[0] });
    expect(validatePlanGraph(p)).toContain("duplicate node id: a");
  });

  it("rejects edges to unknown nodes", () => {
    const p = basePlan();
    p.edges.push({ id: "e3", source: "a", target: "nope" });
    expect(validatePlanGraph(p).some((e) => e.includes("unknown target"))).toBe(true);
  });

  it("rejects gates that are not human_gate nodes", () => {
    const p = basePlan();
    p.approvalGates = ["a"];
    expect(validatePlanGraph(p).some((e) => e.includes("not a human_gate"))).toBe(true);
  });

  it("rejects cycles", () => {
    const p = basePlan();
    p.edges.push({ id: "e3", source: "g", target: "a" });
    expect(validatePlanGraph(p)).toContain("plan graph contains a cycle");
  });
});
