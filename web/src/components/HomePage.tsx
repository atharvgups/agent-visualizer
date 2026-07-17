import { useEffect, useState } from "react";
import { RunSummary, createRun, listRuns } from "../state/api";
import { navigateToRun } from "../state/useHashRoute";
import { RunList } from "./RunList";

export const EXAMPLE_PROMPT = "Research every ChinaJoy side event and prep applications";

export function HomePage({
  onError,
  planning,
  setPlanning,
}: {
  onError: (message: string) => void;
  planning: boolean;
  setPlanning: (v: boolean) => void;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      listRuns()
        .then(({ runs }) => {
          if (!cancelled) setRuns(runs);
        })
        .catch(() => {
          /* home list is best-effort */
        });
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const startExample = async () => {
    setPlanning(true);
    try {
      const { id } = await createRun(EXAMPLE_PROMPT);
      navigateToRun(id);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="home">
      <div className="hero hero-home">
        {planning ? (
          <>
            <div className="spinner" />
            <p>Filing the flight plan — turning your prompt into an executable map…</p>
          </>
        ) : (
          <>
            <h1>See the system before it runs. Watch it while it does.</h1>
            <p>
              Type a goal. The agent files a flight plan you can read — a live map of sub-agents,
              checkpoints and information flow. Approve it, watch it fly, keep the black-box
              recording.
            </p>
            <button className="primary" onClick={() => void startExample()}>
              Try the ChinaJoy example
            </button>
          </>
        )}
      </div>
      <RunList runs={runs} />
    </div>
  );
}
