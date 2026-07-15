import { z } from "zod";

/**
 * The fixed node ontology (pressure test §3d). The planner may only map work
 * onto these six kinds — a constrained vocabulary keeps maps consistent
 * run-to-run instead of arbitrary.
 */
export const NodeKind = z.enum([
  "source", // gathers information from the outside world
  "transform", // reshapes / filters / drafts
  "store", // accumulates results
  "decision", // agent-made branch point
  "human_gate", // execution blocks until a human decides
  "loop", // repeats until a condition is met
]);
export type NodeKind = z.infer<typeof NodeKind>;

export const NodeStatus = z.enum([
  "proposed",
  "pending",
  "running",
  "blocked", // waiting at a human gate
  "paused",
  "done",
  "failed",
  "killed",
]);
export type NodeStatus = z.infer<typeof NodeStatus>;

/**
 * One node of the plan graph. `label` is the human-level name shown on the
 * map ("Find events"); `detail` holds the technical guts that live one click
 * deeper (tools, queries, raw output).
 */
export const PlanNode = z.object({
  id: z.string(),
  kind: NodeKind,
  label: z.string(),
  /** Plain-language sentence of what this node does — drawer summary. */
  summary: z.string(),
  /** Instructions the executing sub-agent follows. Editable via intervention. */
  instructions: z.string(),
  /** Which conceptual sub-agent owns this node (e.g. "web-research"). */
  agent: z.string(),
  /** Branch grouping so pause/kill can target a whole workstream. */
  branch: z.string(),
});
export type PlanNode = z.infer<typeof PlanNode>;

export const PlanEdge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
});
export type PlanEdge = z.infer<typeof PlanEdge>;

export const LoopSpec = z.object({
  nodeId: z.string(),
  /** Human-readable stop condition ("until 2 consecutive empty sweeps"). */
  until: z.string(),
  maxIterations: z.number().int().positive(),
});
export type LoopSpec = z.infer<typeof LoopSpec>;

/**
 * The plan-as-data object. This single JSON graph is simultaneously
 * (a) the render source for the diagram and (b) the orchestrator's execution
 * contract — the "honest diagram" contract. The orchestrator may deviate from
 * it only by emitting a plan_amendment event with a reason.
 */
export const Plan = z.object({
  id: z.string(),
  /** The original user prompt. */
  prompt: z.string(),
  /** How the planner understood the goal — shown above the map. */
  interpretation: z.string(),
  nodes: z.array(PlanNode),
  edges: z.array(PlanEdge),
  /** Node ids of kind human_gate, in execution order. */
  approvalGates: z.array(z.string()),
  loops: z.array(LoopSpec),
});
export type Plan = z.infer<typeof Plan>;

/** Structural mutation carried by a plan_amendment event. */
export const PlanMutation = z.object({
  addNodes: z.array(PlanNode).default([]),
  addEdges: z.array(PlanEdge).default([]),
  removeNodeIds: z.array(z.string()).default([]),
  removeEdgeIds: z.array(z.string()).default([]),
});
export type PlanMutation = z.infer<typeof PlanMutation>;

/** Validates plan graph integrity beyond field shapes. */
export function validatePlanGraph(plan: Plan): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of plan.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
  }
  for (const e of plan.edges) {
    if (!ids.has(e.source)) errors.push(`edge ${e.id}: unknown source ${e.source}`);
    if (!ids.has(e.target)) errors.push(`edge ${e.id}: unknown target ${e.target}`);
  }
  for (const g of plan.approvalGates) {
    const node = plan.nodes.find((n) => n.id === g);
    if (!node) errors.push(`approval gate references unknown node: ${g}`);
    else if (node.kind !== "human_gate") errors.push(`approval gate ${g} is not a human_gate node`);
  }
  for (const l of plan.loops) {
    if (!ids.has(l.nodeId)) errors.push(`loop references unknown node: ${l.nodeId}`);
  }
  // cycle check (loops are modelled as node metadata, the graph itself must be a DAG)
  const adj = new Map<string, string[]>();
  for (const e of plan.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id) ?? 0;
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    for (const next of adj.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  for (const n of plan.nodes) {
    if (visit(n.id)) {
      errors.push("plan graph contains a cycle");
      break;
    }
  }
  return errors;
}
