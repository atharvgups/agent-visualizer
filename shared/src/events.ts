import { z } from "zod";
import { NodeStatus, Plan, PlanMutation } from "./plan";

/**
 * Two-tier event model (pressure test §3b):
 *  - `structural` events mutate the graph and produce annotation cards.
 *    A healthy run emits ~5–15 of these, not 500.
 *  - `operational` events only update status/counters inside existing nodes.
 * Human interventions ride the same bus so they land in the audit trail
 * identically to agent adaptations.
 */

const base = {
  id: z.string(),
  ts: z.number(),
  seq: z.number().int(),
};

// ---- structural ----

export const PlanProposedEvent = z.object({
  ...base,
  type: z.literal("plan_proposed"),
  tier: z.literal("structural"),
  plan: Plan,
});

export const PlanApprovedEvent = z.object({
  ...base,
  type: z.literal("plan_approved"),
  tier: z.literal("structural"),
});

export const PlanAmendmentEvent = z.object({
  ...base,
  type: z.literal("plan_amendment"),
  tier: z.literal("structural"),
  change: z.string(),
  reason: z.string(),
  evidence: z.string(),
  mutation: PlanMutation,
});

export const RunFinishedEvent = z.object({
  ...base,
  type: z.literal("run_finished"),
  tier: z.literal("structural"),
  outcome: z.enum(["completed", "aborted"]),
  summary: z.string(),
});

// ---- operational ----

export const NodeStatusEvent = z.object({
  ...base,
  type: z.literal("node_status"),
  tier: z.literal("operational"),
  nodeId: z.string(),
  status: NodeStatus,
});

export const NodeProgressEvent = z.object({
  ...base,
  type: z.literal("node_progress"),
  tier: z.literal("operational"),
  nodeId: z.string(),
  /** e.g. { "reviewed": 412, "verified": 2 } — rendered as ticking counters. */
  counters: z.record(z.number()),
  note: z.string().optional(),
});

export const NodeOutputEvent = z.object({
  ...base,
  type: z.literal("node_output"),
  tier: z.literal("operational"),
  nodeId: z.string(),
  /** Plain-language summary of what the node produced. */
  summary: z.string(),
  /** Raw technical detail — lives below the fold in the drawer. */
  raw: z.string(),
});

// ---- human gate ----

export const GateItem = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});
export type GateItem = z.infer<typeof GateItem>;

export const GateOpenedEvent = z.object({
  ...base,
  type: z.literal("gate_opened"),
  tier: z.literal("structural"),
  nodeId: z.string(),
  items: z.array(GateItem),
});

export const GateResolvedEvent = z.object({
  ...base,
  type: z.literal("gate_resolved"),
  tier: z.literal("structural"),
  nodeId: z.string(),
  decisions: z.array(
    z.object({
      itemId: z.string(),
      action: z.enum(["approved", "edited", "rejected"]),
      editedContent: z.string().optional(),
    })
  ),
  /** Preference note derived from edits, attached visibly to the node. */
  preferenceNote: z.string().optional(),
});

// ---- interventions (human actions on the same bus) ----

export const InterventionEvent = z.object({
  ...base,
  type: z.literal("intervention"),
  tier: z.literal("structural"),
  action: z.enum([
    "approve_plan",
    "pause_branch",
    "resume_branch",
    "kill_branch",
    "edit_instructions",
    "move_gate",
  ]),
  branch: z.string().optional(),
  nodeId: z.string().optional(),
  instructions: z.string().optional(),
  /** For move_gate: the node id the gate should now follow. */
  afterNodeId: z.string().optional(),
  /** Graph rewiring produced by the intervention (move_gate). */
  mutation: PlanMutation.optional(),
});

export const RunEvent = z.discriminatedUnion("type", [
  PlanProposedEvent,
  PlanApprovedEvent,
  PlanAmendmentEvent,
  RunFinishedEvent,
  NodeStatusEvent,
  NodeProgressEvent,
  NodeOutputEvent,
  GateOpenedEvent,
  GateResolvedEvent,
  InterventionEvent,
]);
export type RunEvent = z.infer<typeof RunEvent>;

export type StructuralEvent = Extract<RunEvent, { tier: "structural" }>;
export type OperationalEvent = Extract<RunEvent, { tier: "operational" }>;
