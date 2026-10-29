---
name: plan-amendment-audit
description: "Record honest mid-run plan changes and replay the event log as an audit trail. Use when a live plan must grow, shrink, or pivot, when the user asks why the map changed, or when exporting or scrubbing a finished run. Every deviation needs a mutation, a reason, and evidence. Silent graph edits are not allowed."
summary: "The map only changes when you say why, with evidence. Afterwards you can scrub the log and see how the plan became what actually ran."
version: "1.0.0"
tags:
  - audit
  - amendments
  - replay
  - event-log
keywords:
  - plan amendment
  - evidence
  - audit trail
  - timeline scrub
  - honest diagram
use_cases:
  - "Findings show a missing source and the plan needs a new branch"
  - "The user asks why a node appeared that was not on the proposed map"
  - "A finished run needs an exportable log, not a chat recap"
---

# Plan amendment and audit trail

The diagram is ground truth. If execution needs to do something the graph does not contain, you do not quietly do it. You emit a `plan_amendment`, then do it.

The same log is the audit trail. Replay is folding a prefix of that log. There is no separate "what we told the user" story.

## When to use

Use this skill when:

- Worker output shows the current plan would miss something material
- You want to add, remove, or rewire nodes after launch
- The user asks "why did the plan change?"
- The run finished (or aborted) and they want a timeline, a scrubber, or an export

Do not use it to tweak copy on a node. That is `edit_instructions`. Do not use it to pause a branch. That is an intervention.

## The amendment contract

A `plan_amendment` is structural. It must include all four of these:

| Field | What it is |
|-------|------------|
| `change` | Short title for the card. "New branch: Chinese social discovery" |
| `reason` | Why the current graph is wrong or incomplete. One or two sentences. |
| `evidence` | A measured fact from worker output, not a vibe. Counts, shares, missing fields, failed checks. |
| `mutation` | `addNodes`, `addEdges`, `removeNodeIds`, `removeEdgeIds` |

If you cannot fill `evidence` with something you actually observed, you do not amend. You keep executing the current graph, or you stop and ask the human.

Thresholds belong in the reason. Example: only add a language-specific source branch when a measured share of verified findings from that language crosses 30 percent, and say the percentage in `evidence`.

## How to amend

1. Inspect real outputs (verified items, failed fetches, empty sweeps). Do not amend on a hunch before any node has finished.
2. Draft the mutation. New nodes use the same six kinds, labels, agents, and branches as the original plan. Wire them into an existing merge/store node when you can, instead of starting a disconnected island.
3. Apply the mutation on a copy. Re-check: unique ids, DAG, edges point at real nodes.
4. Append the event. Set new nodes to `pending`. Continue the scheduler.
5. Show a card on the board: title = `change`, body = `reason`, footer = `evidence`.

Do not emit 20 tiny amendments. Batch into one change a human would recognize.

```bash
python3 scripts/replay_audit.py events.jsonl --check-amendments
```

That flags amendments missing reason or evidence, and mutations that would not apply cleanly.

## What counts as evidence

Good:

- "38% of 26 verified events came from Chinese-language sources."
- "Three consecutive platform sweeps returned 0 listings, maxIterations is 3."
- "The only remaining items lack a registration URL, which the current draft node cannot fill."

Bad:

- "I thought it might help."
- "The user probably also wants Twitter."
- "Adding more agents is more thorough."

## After the run

When every node is `done`, `failed`, or `killed`, emit `run_finished`:

- `outcome: "completed"` if at least one node is `done`
- `outcome: "aborted"` if the worker died, the human cancelled everything, or nothing completed
- `summary`: a sentence that matches the map, not a marketing recap

Then you may:

- Export the JSONL log
- Scrub: fold only events with `seq <= N` and draw the map at that moment
- Answer "what actually ran?" from the folded state, not from memory

```bash
python3 scripts/replay_audit.py events.jsonl --until 15
python3 scripts/replay_audit.py events.jsonl --export-markdown
```

Event shapes: [references/event-log.md](references/event-log.md). A tiny sample log: [references/sample-events.jsonl](references/sample-events.jsonl).

## Honest-diagram rules of thumb

- Structural events stay rare (about 5 to 15 per run).
- Operational noise never mutates the graph.
- Human interventions and agent amendments share one log.
- Crashed mid-run? Next boot writes `aborted`. The map does not pretend the dead run is alive.
- If the user asks you to hide a change, refuse. The diagram cannot narrate a different plan than the one you executed.

## What not to do

- Add a node, run it, then mention it in chat without an amendment event.
- Copy the whole plan into a new object and call that an amendment. Send a mutation.
- Use `reason` as a caption for work you already did off-graph.
- Rewrite history by editing old events. Append only.
