# agent-visualizer

Mission control for delegated work: an AI agent's plan and execution shown as a live, evolving diagram instead of a chat spinner. You talk to the agent in chat — you watch and steer it through the map.

One object — the plan graph — in three modes:

1. **Proposed plan** — the agent files a "flight plan" generated from your prompt: sub-agents, information flow, and where it will stop for your approval. You review it (and can move the review gate) before anything runs.
2. **Live system** — the same diagram becomes the dashboard: nodes light up as agents work, counters tick inside nodes, and new branches grow when the agent adapts — each with a reason card ("38% of verified events came from Chinese-language sources").
3. **Audit trail** — afterwards, scrub the timeline to replay how the plan became what actually ran. Export the full event log.

## The honest-diagram contract

The plan is a JSON graph (`shared/src/plan.ts`) that is simultaneously the render source for the diagram **and** the orchestrator's execution contract. The orchestrator can deviate only by emitting a `plan_amendment` event with a mutation, a reason, and evidence. The diagram is a render of ground truth, never a narration of it.

Diff noise is controlled with two event tiers: **structural** events (new branch, gate, pivot — roughly 5–15 per run) mutate the graph and produce annotation cards; **operational** events (retries, counters) only update state inside existing nodes.

## Architecture

- `shared/` — plan schema (fixed node ontology: source / transform / store / decision / human_gate / loop), two-tier event schema, and the pure event-log reducer used by both the live view and the timeline replay.
- `server/` — planner (LLM-backed when `ANTHROPIC_API_KEY` is set, deterministic domain planner otherwise) and the orchestrator that executes the plan JSON with simulated tools, streaming events over SSE. Express API on port 4400.
- `web/` — React + React Flow (dagre auto-layout) UI on port 5180. Node drawer with human-level summary first and technical detail one click deeper; interventions (pause / kill branch, edit instructions); human gate panel; timeline scrubber.

## Development

```bash
pnpm install
pnpm dev        # server on :4400, web on :5180 (proxies /api)
pnpm test       # vitest across all packages
pnpm lint
pnpm typecheck
pnpm build
```

Environment variables (all optional):

- `ANTHROPIC_API_KEY` — use an LLM for planning arbitrary prompts. Without it, a deterministic planner covers the research → verification → application-drafting domain.
- `SIM_SPEED` — multiplier for simulated work speed (tests use 60).
- `PORT` — server port (default 4400).
- `DATA_DIR` — where run event logs are persisted as JSONL (default `data/runs` under the server working directory).

## Persistence & honesty across restarts

Every event is appended to a per-run JSONL file, so audit trails survive restarts and appear in the home-page run list. A run that was mid-execution when the server died is closed with an explicit `aborted` marker on the next boot — the map never pretends a dead run is alive. Runs are shareable/reloadable via `#/run/<id>` URLs.

## Deployment

Single-container production image (the server serves the built frontend on one port):

```bash
docker build -t agent-visualizer .
docker run -p 4400:4400 -v agent-viz-data:/data agent-visualizer
```

Or without Docker: `pnpm install && pnpm --filter web build && pnpm start` (serves everything on `PORT`, default 4400). Health check endpoint: `GET /healthz`.

## Try it

Open the web app and click "Try the ChinaJoy example" (or type your own research prompt). Approve the proposed plan — optionally moving the review gate earlier — then watch the run: the Chinese-social-discovery branch appears mid-run with its evidence card, drafts stop at the human gate for your approve/edit/reject decisions, and the finished map becomes a scrubbable audit trail.
