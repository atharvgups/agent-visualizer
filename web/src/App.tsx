import { useState } from "react";
import { HomePage } from "./components/HomePage";
import { RunPage } from "./components/RunPage";
import { createRun } from "./state/api";
import { navigateHome, navigateToRun, useHashRoute } from "./state/useHashRoute";
import { useToasts } from "./state/useToasts";

export default function App() {
  const route = useHashRoute();
  const { toasts, pushToast } = useToasts();
  const [prompt, setPrompt] = useState("");
  const [planning, setPlanning] = useState(false);

  const submitPrompt = async () => {
    if (!prompt.trim() || planning) return;
    setPlanning(true);
    try {
      const { id } = await createRun(prompt.trim());
      setPrompt("");
      navigateToRun(id);
    } catch (err) {
      pushToast((err as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={navigateHome}>
          <span className="brand-mark">◉</span> Agent Visualizer
          <span className="tagline">talk in chat · steer on the map</span>
        </button>
        <form
          className="prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPrompt();
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a goal — the agent will file a flight plan for it"
            aria-label="prompt"
          />
          <button type="submit" className="primary" disabled={planning || !prompt.trim()}>
            {planning ? "Planning…" : "Plan it"}
          </button>
        </form>
      </header>

      {route.runId ? (
        <RunPage key={route.runId} runId={route.runId} onError={pushToast} />
      ) : (
        <HomePage onError={pushToast} planning={planning} setPlanning={setPlanning} />
      )}

      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
