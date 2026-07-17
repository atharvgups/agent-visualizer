import { useState } from "react";
import { RunState } from "@agent-viz/shared";

export function NodeDrawer({
  state,
  nodeId,
  onClose,
  onIntervene,
  live,
}: {
  state: RunState;
  nodeId: string;
  onClose: () => void;
  onIntervene: (body: Record<string, string>) => Promise<void>;
  live: boolean;
}) {
  const node = state.plan?.nodes.find((n) => n.id === nodeId);
  const rt = state.nodeRuntime[nodeId];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node?.instructions ?? "");
  const [showRaw, setShowRaw] = useState(false);
  if (!node) return null;

  const branchPaused = state.pausedBranches.includes(node.branch);
  const terminal = ["done", "failed", "killed"].includes(rt?.status ?? "");

  return (
    <div className="drawer">
      <div className="drawer-head">
        <div>
          <div className="drawer-title">{node.label}</div>
          <div className="drawer-sub">
            {node.kind.replace("_", " ")} · branch <b>{node.branch}</b> · {rt?.status ?? "proposed"}
          </div>
        </div>
        <button className="ghost" onClick={onClose}>
          ✕
        </button>
      </div>

      {live && !terminal && (
        <div className="drawer-section row">
          {branchPaused ? (
            <button onClick={() => onIntervene({ action: "resume_branch", branch: node.branch })}>
              ▶ Resume branch
            </button>
          ) : (
            <button onClick={() => onIntervene({ action: "pause_branch", branch: node.branch })}>
              ⏸ Pause branch
            </button>
          )}
          <button
            className="danger"
            onClick={() => {
              if (window.confirm(`Kill branch "${node.branch}"? Its remaining work stops permanently.`)) {
                void onIntervene({ action: "kill_branch", branch: node.branch });
              }
            }}
          >
            ✕ Kill branch
          </button>
        </div>
      )}

      <p className="drawer-summary">{node.summary}</p>
      {rt && Object.keys(rt.counters).length > 0 && (
        <div className="node-counters">
          {Object.entries(rt.counters).map(([k, v]) => (
            <span key={k} className="counter">
              {v.toLocaleString()} {k}
            </span>
          ))}
        </div>
      )}
      {rt?.outputSummary && <p className="drawer-output">{rt.outputSummary}</p>}
      {rt?.preferenceNote && <div className="drawer-pref">✎ {rt.preferenceNote}</div>}

      <div className="drawer-section">
        <div className="section-head">
          <span>Instructions</span>
          {live && !terminal && !editing && (
            <button className="ghost" onClick={() => { setDraft(node.instructions); setEditing(true); }}>
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="edit-box">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
            <div className="row">
              <button
                onClick={async () => {
                  await onIntervene({ action: "edit_instructions", nodeId: node.id, instructions: draft });
                  setEditing(false);
                }}
              >
                Apply (next loop)
              </button>
              <button className="ghost" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mono-block">{node.instructions}</p>
        )}
      </div>

      {rt?.outputRaw && (
        <div className="drawer-section">
          <button className="ghost" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? "Hide" : "Show"} technical detail
          </button>
          {showRaw && <pre className="raw-detail">{rt.outputRaw}</pre>}
        </div>
      )}
    </div>
  );
}
