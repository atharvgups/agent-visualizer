import { RunSummary } from "../state/api";
import { navigateToRun } from "../state/useHashRoute";

const PHASE_LABEL: Record<string, string> = {
  planning: "Planning",
  proposed: "Awaiting approval",
  executing: "Running",
  gated: "Waiting for review",
  finished: "Finished",
};

function phaseClass(r: RunSummary): string {
  if (r.phase === "finished") return r.outcome === "completed" ? "chip-done" : "chip-aborted";
  if (r.phase === "executing" || r.phase === "gated") return "chip-live";
  return "chip-proposed";
}

export function RunList({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="run-list">
      <h2>Previous runs</h2>
      {runs.map((r) => (
        <button key={r.id} className="run-row" onClick={() => navigateToRun(r.id)}>
          <span className="run-prompt">{r.prompt || "(untitled run)"}</span>
          <span className="run-meta">
            <span className={`chip ${phaseClass(r)}`}>
              {r.phase === "finished" && r.outcome === "aborted"
                ? "Aborted"
                : (PHASE_LABEL[r.phase] ?? r.phase)}
            </span>
            <span className="run-nodes">{r.nodeCount} nodes</span>
            <span className="run-date">{new Date(r.createdAt).toLocaleString()}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
