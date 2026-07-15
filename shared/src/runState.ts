import { NodeStatus, Plan } from "./plan";
import { GateItem, RunEvent } from "./events";
import { applyPlanMutation } from "./interventions";

/**
 * Pure reducer: fold the append-only event log into the current run state.
 * Used identically by the live view and the timeline scrubber — replay is
 * just re-folding a prefix of the log (mode 3 for free).
 */

export type RunPhase = "planning" | "proposed" | "executing" | "gated" | "finished";

export interface AnnotationCard {
  eventId: string;
  ts: number;
  title: string;
  body: string;
  evidence?: string;
  kind: "amendment" | "intervention" | "gate" | "lifecycle";
  nodeId?: string;
}

export interface NodeRuntime {
  status: NodeStatus;
  counters: Record<string, number>;
  note?: string;
  outputSummary?: string;
  outputRaw?: string;
  preferenceNote?: string;
}

export interface GateState {
  nodeId: string;
  items: GateItem[];
}

export interface RunState {
  phase: RunPhase;
  plan: Plan | null;
  nodeRuntime: Record<string, NodeRuntime>;
  annotations: AnnotationCard[];
  openGate: GateState | null;
  pausedBranches: string[];
  outcome?: "completed" | "aborted";
  outcomeSummary?: string;
}

export function initialRunState(): RunState {
  return {
    phase: "planning",
    plan: null,
    nodeRuntime: {},
    annotations: [],
    openGate: null,
    pausedBranches: [],
  };
}

function runtime(state: RunState, nodeId: string): NodeRuntime {
  return (
    state.nodeRuntime[nodeId] ?? { status: "proposed", counters: {} }
  );
}

export function reduceEvent(state: RunState, ev: RunEvent): RunState {
  switch (ev.type) {
    case "plan_proposed": {
      const nodeRuntime: Record<string, NodeRuntime> = {};
      for (const n of ev.plan.nodes) nodeRuntime[n.id] = { status: "proposed", counters: {} };
      return { ...state, phase: "proposed", plan: ev.plan, nodeRuntime };
    }
    case "plan_approved": {
      const nodeRuntime = Object.fromEntries(
        Object.entries(state.nodeRuntime).map(([id, rt]) => [
          id,
          { ...rt, status: "pending" as NodeStatus },
        ])
      );
      return {
        ...state,
        phase: "executing",
        nodeRuntime,
        annotations: [
          ...state.annotations,
          { eventId: ev.id, ts: ev.ts, title: "Plan approved", body: "Execution started.", kind: "lifecycle" },
        ],
      };
    }
    case "plan_amendment": {
      if (!state.plan) return state;
      const plan = applyPlanMutation(state.plan, ev.mutation);
      const nodeRuntime = { ...state.nodeRuntime };
      for (const n of ev.mutation.addNodes) nodeRuntime[n.id] = { status: "pending", counters: {} };
      return {
        ...state,
        plan,
        nodeRuntime,
        annotations: [
          ...state.annotations,
          {
            eventId: ev.id,
            ts: ev.ts,
            title: ev.change,
            body: ev.reason,
            evidence: ev.evidence,
            kind: "amendment",
            nodeId: ev.mutation.addNodes[0]?.id,
          },
        ],
      };
    }
    case "node_status": {
      return {
        ...state,
        nodeRuntime: {
          ...state.nodeRuntime,
          [ev.nodeId]: { ...runtime(state, ev.nodeId), status: ev.status },
        },
      };
    }
    case "node_progress": {
      const rt = runtime(state, ev.nodeId);
      return {
        ...state,
        nodeRuntime: {
          ...state.nodeRuntime,
          [ev.nodeId]: {
            ...rt,
            counters: { ...rt.counters, ...ev.counters },
            note: ev.note ?? rt.note,
          },
        },
      };
    }
    case "node_output": {
      const rt = runtime(state, ev.nodeId);
      return {
        ...state,
        nodeRuntime: {
          ...state.nodeRuntime,
          [ev.nodeId]: { ...rt, outputSummary: ev.summary, outputRaw: ev.raw },
        },
      };
    }
    case "gate_opened": {
      return {
        ...state,
        phase: "gated",
        openGate: { nodeId: ev.nodeId, items: ev.items },
        annotations: [
          ...state.annotations,
          {
            eventId: ev.id,
            ts: ev.ts,
            title: "Waiting for your review",
            body: `${ev.items.length} item(s) need a decision.`,
            kind: "gate",
            nodeId: ev.nodeId,
          },
        ],
      };
    }
    case "gate_resolved": {
      const rt = runtime(state, ev.nodeId);
      const approved = ev.decisions.filter((d) => d.action !== "rejected").length;
      return {
        ...state,
        phase: "executing",
        openGate: null,
        nodeRuntime: {
          ...state.nodeRuntime,
          [ev.nodeId]: { ...rt, preferenceNote: ev.preferenceNote ?? rt.preferenceNote },
        },
        annotations: [
          ...state.annotations,
          {
            eventId: ev.id,
            ts: ev.ts,
            title: "Human review complete",
            body: `${approved}/${ev.decisions.length} items approved${ev.preferenceNote ? " — preference noted" : ""}.`,
            kind: "gate",
            nodeId: ev.nodeId,
          },
        ],
      };
    }
    case "intervention": {
      let next = state;
      if (ev.mutation && state.plan) {
        next = { ...next, plan: applyPlanMutation(state.plan, ev.mutation) };
      }
      if (ev.action === "edit_instructions" && ev.nodeId && ev.instructions && next.plan) {
        next = {
          ...next,
          plan: {
            ...next.plan,
            nodes: next.plan.nodes.map((n) =>
              n.id === ev.nodeId ? { ...n, instructions: ev.instructions! } : n
            ),
          },
        };
      }
      if (ev.action === "pause_branch" && ev.branch) {
        next = { ...next, pausedBranches: [...new Set([...next.pausedBranches, ev.branch])] };
      } else if (ev.action === "resume_branch" && ev.branch) {
        next = { ...next, pausedBranches: next.pausedBranches.filter((b) => b !== ev.branch) };
      }
      const titles: Record<string, string> = {
        approve_plan: "Plan approved by user",
        pause_branch: `Branch paused: ${ev.branch}`,
        resume_branch: `Branch resumed: ${ev.branch}`,
        kill_branch: `Branch killed: ${ev.branch}`,
        edit_instructions: "Node instructions edited",
        move_gate: "Review gate moved",
      };
      return {
        ...next,
        annotations: [
          ...next.annotations,
          {
            eventId: ev.id,
            ts: ev.ts,
            title: titles[ev.action],
            body:
              ev.action === "edit_instructions"
                ? `New instructions: ${ev.instructions ?? ""}`
                : "Applied by the user mid-run.",
            kind: "intervention",
            nodeId: ev.nodeId,
          },
        ],
      };
    }
    case "run_finished": {
      return {
        ...state,
        phase: "finished",
        outcome: ev.outcome,
        outcomeSummary: ev.summary,
        annotations: [
          ...state.annotations,
          { eventId: ev.id, ts: ev.ts, title: "Run finished", body: ev.summary, kind: "lifecycle" },
        ],
      };
    }
  }
}

export function reduceEvents(events: RunEvent[]): RunState {
  return events.reduce(reduceEvent, initialRunState());
}
