import { Handle, Position } from "@xyflow/react";
import { NodeKind, NodeStatus } from "@agent-viz/shared";

export interface PlanNodeData {
  label: string;
  kind: NodeKind;
  status: NodeStatus;
  branch: string;
  counters: Record<string, number>;
  note?: string;
  isNew?: boolean;
  hasPreferenceNote?: boolean;
  [key: string]: unknown;
}

/** Deterministic hue per branch so workstreams read as visual groups. */
export function branchHue(branch: string): number {
  let h = 0;
  for (let i = 0; i < branch.length; i++) h = (h * 31 + branch.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

const KIND_LABEL: Record<NodeKind, string> = {
  source: "Source",
  transform: "Transform",
  store: "Store",
  decision: "Decision",
  human_gate: "Your call",
  loop: "Loop",
};

const KIND_ICON: Record<NodeKind, string> = {
  source: "◍",
  transform: "⇄",
  store: "▤",
  decision: "◆",
  human_gate: "✋",
  loop: "↻",
};

export function PlanNodeCard({ data }: { data: PlanNodeData }) {
  const counters = Object.entries(data.counters);
  const hue = branchHue(data.branch);
  return (
    <div
      className={`plan-node status-${data.status}${data.isNew ? " node-new" : ""}`}
      style={{ borderLeft: `3px solid hsl(${hue} 65% 55% / 0.85)` }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-head">
        <span className={`kind-badge kind-${data.kind}`}>
          {KIND_ICON[data.kind]} {KIND_LABEL[data.kind]}
        </span>
        <span
          className="branch-tag"
          style={{ color: `hsl(${hue} 65% 70%)` }}
          title={`branch: ${data.branch}`}
        >
          {data.branch}
        </span>
        <span className={`status-dot status-dot-${data.status}`} title={data.status} />
      </div>
      <div className="node-label">{data.label}</div>
      {counters.length > 0 && (
        <div className="node-counters">
          {counters.map(([k, v]) => (
            <span key={k} className="counter">
              {v.toLocaleString()} {k}
            </span>
          ))}
        </div>
      )}
      {data.note && <div className="node-note">{data.note}</div>}
      {data.hasPreferenceNote && <div className="pref-note">✎ preference noted</div>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
