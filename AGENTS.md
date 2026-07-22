# AGENTS.md

## Cursor Cloud specific instructions

Monorepo (pnpm workspaces): `shared/` (plan schema, event schema, reducer), `server/` (Express API + orchestrator, port 4400), `web/` (Vite + React Flow UI, port 5180, proxies `/api` to the server). Standard commands (`pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`) are defined in the root `package.json` and run recursively.

Non-obvious notes:

- `pnpm dev` starts both server and web in parallel. Runs are held in server memory only — restarting the server clears all runs, and an already-open browser tab's SSE stream dies silently; reload the page after a server restart.
- `SIM_SPEED` (server env var, default 1) multiplies simulated work speed. Automated tests set 60. For GUI demos of mid-run interventions (pause/kill branch), start the server with `SIM_SPEED=0.25`–`0.5` or the run finishes too fast to click anything.
- The planner is deterministic (domain: event research → application drafting) unless `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is set, in which case an LLM plans arbitrary prompts with the deterministic planner as fallback. Anthropic wins if both are set. Gemini defaults to `gemini-2.5-flash` with thinking disabled (`GEMINI_THINKING_BUDGET=0`) so plan JSON is not eaten by thinking tokens.
- The mid-run "Chinese social discovery" plan amendment only triggers when the measured share of verified findings from Chinese-language sources crosses a threshold — use a China-related topic (e.g. ChinaJoy) in demos; other topics correctly won't amend.
- `SIM_SPEED` is read at module load in `server/src/orchestrator/run.ts`; in tests set `process.env.SIM_SPEED` before importing the module (see `run.test.ts`).
- Runs persist as JSONL under `DATA_DIR` (default `server/data/runs` in dev, gitignored). Restarting the server closes any mid-execution run with an `aborted` event; interventions on non-live runs return 409. Delete the data dir for a clean slate.
- Production mode is single-port: if `web/dist` exists, the server serves it with an SPA fallback; `pnpm --filter web build && pnpm start`. The Dockerfile packages exactly this.
