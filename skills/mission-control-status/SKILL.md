---
name: mission-control-status
description: "Keep a live mission-control board for parallel agent workstreams. Use when multiple subagents are running, when the user asks what is happening, which branch is stuck, or for a status map of a delegated run. Fold an event log into node statuses, counters, and a short annotation feed. Never draw a dead or aborted run as live."
summary: "A status board for parallel agents. The map lights up. Counters tick. Structural changes get cards. Dead runs stay dead."
version: "1.0.0"
tags:
  - monitoring
  - parallel-agents
  - status
  - observability
keywords:
  - mission control
  - live run
  - event log
  - annotation cards
  - SSE
use_cases:
  - "Several subagents are working and the user wants a board, not a chat spinner"
  - "A run looks stuck and you need to say which branch is blocked, paused, or dead"
  - "You are streaming progress and must not flood the human with every retry"
---

# Mission control for parallel agents

Chat spinners hide parallel work. A map does not.

Keep one run state folded from an append-only event log. The live view and a later replay use the same fold. If the process dies, close the run with an explicit aborted marker. Never leave a corpse looking alive.

## When to use

Use this skill when:

- Two or more agents or branches are in flight
- The user asks "what's going on", "where are we", "which branch is stuck"
- You are about to dump a wall of tool output and they need a board instead
- A previous run might still be on screen after a restart

Skip it for a single short tool call with no branches.

## Two-tier events

A healthy run emits about 5 to 15 **structural** events, not 500.

**Structural** (mutate the graph or the story the human should see):

- `plan_proposed`
- `plan_approved`
- `plan_amendment`
- `gate_opened` / `gate_resolved`
- `intervention`
- `run_finished`

Each one becomes an annotation card.

**Operational** (stay inside existing nodes):

- `node_status` (proposed, pending, running, blocked, paused, done, failed, killed)
- `node_progress` (counters such as `{ "reviewed": 412, "verified": 2 }`)
- `node_output` (plain-language `summary` plus optional `raw` below the fold)

Retries, heartbeats, and token counts are operational. Do not mint a new node for "tried again."

## Run phases

`planning` → `proposed` → `executing` → `gated` (if a human gate is open) → `finished`

Finished carries `outcome`: `completed` or `aborted`, plus a one-line `summary`.

If your session restarted, the server crashed, or the subagents vanished:

1. Append `run_finished` with `outcome: "aborted"` and a sentence that says so
2. Flip the board to finished
3. Do not keep pulsing `running` on nodes that no longer have a worker

Interventions against a non-live run are a conflict. Say the run is over.

## Status board

Every time the user looks, or after each structural event (and on a slow drip for operational), show:

1. **Phase and live flag.** `executing · live` or `finished · aborted`. The live flag is a fact about a worker still being there, not a color on the map.
2. **The map.** Same node layout as the proposed plan, with status on each node. Group visually by `branch`.
3. **Counters on running nodes.** `found 38`, `reviewed 12 / verified 4`. Replace the previous counters. Do not append a new paragraph each tick.
4. **Annotation feed.** Newest first. Only structural cards. Four kinds:
   - `amendment` ("Plan changed")
   - `intervention` ("You stepped in")
   - `gate` ("Checkpoint")
   - `lifecycle` ("Run")
5. **Open gate, if any.** Item titles, not the full drafts unless they asked.

A compact fold of a JSONL log:

```bash
python3 scripts/reduce_events.py events.jsonl
```

Pass `--seq N` to fold only up to that event (timeline scrub). Details: [references/status-board.md](references/status-board.md).

## How to write events

Every event needs `id`, `ts` (unix ms), `seq` (0, 1, 2, ...). Append only. Never edit a past line.

Status changes: emit `node_status` only when the status actually changed.

Progress: emit `node_progress` on a human-readable cadence (every batch, not every token). Counters are a map of numbers. Optional `note` is one clause.

Output: when a node finishes work, one `node_output` with a sentence in `summary` and detail in `raw`.

## Rendering the map in chat

Mermaid is enough if you have no UI:

- `running` emphasized
- `blocked` / `paused` as waiting
- `done` as settled
- `failed` / `killed` as stopped
- `pending` quiet

Say in prose which branches are moving, which are paused, which are dead. One short paragraph under the diagram.

## Parallelism rules

- A node starts only when every upstream node is in a terminal status (`done`, `failed`, `killed`) and at least one upstream is `done` (unless it has no upstream).
- If every upstream died, this node is `killed`, not `running`.
- Paused branches skip starting new nodes. Already-running nodes checkpoint to `paused`.
- Do not serialize work that the plan drew as parallel.

## What not to do

- Narrate operational events as a chat novel. They tick on the node.
- Draw `live` after `run_finished`.
- Hide a kill by leaving the node `running`.
- Create new nodes for retries. Retries are counters or a note.
- Use this board as a substitute for asking the human at a real `human_gate`.
