import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowMap } from "./components/FlowMap";
import { AnnotationFeed } from "./components/AnnotationFeed";
import { NodeDrawer } from "./components/NodeDrawer";
import { GatePanel } from "./components/GatePanel";
import { Timeline } from "./components/Timeline";
import { useRun } from "./state/useRun";

const EXAMPLE_PROMPT = "Research every ChinaJoy side event and prep applications";

export default function App() {
  const run = useRun();
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [gateAnchor, setGateAnchor] = useState<string>("");

  const { state, liveState } = run;
  const plan = state.plan;
  const isLive = run.scrub === null;
  const gateId = plan?.approvalGates[0];
  const gateNode = plan?.nodes.find((n) => n.id === gateId);

  const startRun = (p: string) => {
    setSelected(null);
    setGateAnchor("");
    void run.start(p);
  };

  const exportAudit = () => {
    const blob = new Blob([JSON.stringify(run.events, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-trail-${run.runId}.json`;
    a.click();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◉</span> Agent Visualizer
          <span className="tagline">talk in chat · steer on the map</span>
        </div>
        <form
          className="prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim()) startRun(prompt.trim());
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={EXAMPLE_PROMPT}
            aria-label="prompt"
          />
          <button type="submit" className="primary" disabled={run.planning || !prompt.trim()}>
            {run.planning ? "Planning…" : "Plan it"}
          </button>
        </form>
      </header>

      {!plan && !run.planning && (
        <div className="hero">
          <h1>See the system before it runs. Watch it while it does.</h1>
          <p>
            Type a goal. The agent files a flight plan you can read — a live map of sub-agents,
            checkpoints and information flow. Approve it, watch it fly, keep the black-box recording.
          </p>
          <button className="primary" onClick={() => { setPrompt(EXAMPLE_PROMPT); startRun(EXAMPLE_PROMPT); }}>
            Try the ChinaJoy example
          </button>
        </div>
      )}

      {run.planning && (
        <div className="hero">
          <div className="spinner" />
          <p>Filing the flight plan — turning your prompt into an executable map…</p>
        </div>
      )}

      {plan && (
        <div className="workspace">
          <div className="map-column">
            <div className="interpretation">
              <span className="interp-label">How I understood it</span>
              <p>{plan.interpretation}</p>
            </div>

            {state.phase === "proposed" && isLive && (
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
              <div className="finished-bar">
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
              live={isLive && state.phase === "executing"}
            />
          )}

          {isLive && liveState.openGate && (
            <GatePanel gate={liveState.openGate} onResolve={run.resolveGate} />
          )}
        </div>
      )}
    </div>
  );
}
