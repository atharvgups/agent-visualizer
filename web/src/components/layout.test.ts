import { describe, expect, it } from "vitest";
import { Plan } from "@agent-viz/shared";
import { layoutPlan } from "./layout";

const plan: Plan = {
  id: "p",
  prompt: "x",
  interpretation: "x",
  nodes: ["a", "b", "c"].map((id) => ({
    id,
    kind: "transform",
    label: id,
    summary: "",
    instructions: "",
    agent: "x",
    branch: "x",
  })),
  edges: [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
  ],
  approvalGates: [],
  loops: [],
};

describe("layoutPlan", () => {
  it("assigns a position to every node, flowing left to right", () => {
    const positions = layoutPlan(plan);
    expect(positions.size).toBe(3);
    expect(positions.get("a")!.x).toBeLessThan(positions.get("b")!.x);
    expect(positions.get("b")!.x).toBeLessThan(positions.get("c")!.x);
  });
});
