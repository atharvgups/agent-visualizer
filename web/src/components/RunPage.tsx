import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowMap } from "./FlowMap";
import { AnnotationFeed } from "./AnnotationFeed";
import { NodeDrawer } from "./NodeDrawer";
import { GatePanel } from "./GatePanel";
import { Timeline } from "./Timeline";
import { useRun } from "../state/useRun";
import { navigateHome } from "../state/useHashRoute";

export function RunPage({
  runId,
  onError,
}: {
  runId: string;
  onError: (message: string) => void;
}) {
  const run = useRun(runId, onError);
  const [selected, setSelected] = useState<string | null>(null);
  const [gateAnchor, setGateAnchor] = useState<string>("");

  const { state, liveState } = run;
  const plan = state.plan;
  const isLive = run.scrub === null;
  const gateId = plan?.approvalGates[0];
  const gateNode = plan?.nodes.find((n) => n.id === gateId);

  useEffect(() => {
    document.title = plan?.prompt
      ? `${plan.prompt} — Agent Visualizer`
      : "Agent Visualizer — mission control for delegated work";
    return () => {
      document.title = "Agent Visualizer — mission control for delegated work";
    };
  }, [plan?.prompt]);

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify(run.events, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-trail-${runId}.json`;
    a.click();
  };

  if (run.loading) {
    return (
      <div className="hero">
        <div className="spinner" />
        <p>Loading run…</p>
      </div>
    );
  }

  if (run.notFound || !plan) {
    return (
      <div className="hero">
        <h1>Run not found</h1>
        <p>This run doesn't exist on the server (it may have been created against a different data directory).</p>
        <button className="primary" onClick={navigateHome}>
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="workspace">
      <div className="map-column">
        <div className="interpretation">
          <span className="interp-label">How I understood it</span>
          <p>{plan.interpretation}</p>
        </div>

        {state.phase === "proposed" && isLive && run.live && (
          <div className="approve-bar">
            <span className="proposed-hint">
              Proposed plan — nothing has run yet. Review the map, then launch.
            </span>
            {gateNode && (
              <span className="gate-move">
                Move <b>{gateNode.label}</b> to after
                <select value={gateAnchor} onChange={(e) => setGateAnchor(e.target.value)}>
                  <option value="">(keep as planned)</option>
                  {plan.nodes
                    .filter((n) => n.id !== gateId && n.kind !== "human_gate")
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                </select>
              </span>
            )}
            <button
              className="primary"
              onClick={async () => {
                if (gateAnchor && gateId) {
                  await run.intervene({ action: "move_gate", nodeId: gateId, afterNodeId: gateAnchor });
                }
                await run.approve();
              }}
            >
              ✓ Approve & launch
            </button>
          </div>
        )}

        {state.phase === "finished" && (
          <div className={`finished-bar ${state.outcome === "aborted" ? "aborted-bar" : ""}`}>
            <span>
              {state.outcome === "completed" ? "✓" : "✕"} {state.outcomeSummary}
            </span>
            <button onClick={exportAudit}>Export audit trail</button>
          </div>
        )}

        <div className={`map-wrap phase-${state.phase}${isLive ? "" : " replaying"}`}>
          <ReactFlowProvider>
            <FlowMap state={state} onSelect={setSelected} />
          </ReactFlowProvider>
          {!isLive && <div className="replay-badge">REPLAY</div>}
        </div>

        {run.events.length > 1 && (
          <Timeline events={run.events} scrub={run.scrub} setScrub={run.setScrub} />
        )}
      </div>

      <aside className="side-column">
        <h2>What changed & why</h2>
        <AnnotationFeed annotations={state.annotations} />
      </aside>

      {selected && (
        <NodeDrawer
          state={state}
          nodeId={selected}
          onClose={() => setSelected(null)}
          onIntervene={run.intervene}
          live={isLive && run.live && state.phase === "executing"}
        />
      )}

      {isLive && run.live && liveState.openGate && (
        <GatePanel gate={liveState.openGate} onResolve={run.resolveGate} />
      )}
    </div>
  );
}
