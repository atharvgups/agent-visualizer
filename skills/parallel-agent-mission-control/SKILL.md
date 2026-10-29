---
name: parallel-agent-mission-control
description: Builds a live status board for parallel agent branches from an event log, with counters, paused work, and a few structural cards instead of a chat spinner. Use when the user asks how the run is going, wants mission control, or needs status across sub-agents.
summary: Show parallel agent work as a mission-control board. Fold the event log into per-branch status, ticking counters, and a short list of real plan changes. Never leave a dead run looking live.
version: "1.0.0"
tags:
  - agents
  - status
  - orchestration
  - observability
keywords:
  - mission control
  - parallel agents
  - run status
  - event log
use_cases:
  - Several sub-agents are running and the user asks for a status picture
  - The user wants counters and branch health, not a wall of tool logs
  - A run may have crashed and you must not pretend it is still live
---

# Parallel agent mission control

The user asked how the system is doing, not for another transcript dump. Fold the event log into a board: branches as rows, node status and counters in place, structural changes as a few cards.

Read `references/event-model.md` first.

## When to use

- Two or more branches or sub-agents are in flight.
- The user asks for status, mission control, a dashboard, or "what's running."
- You are updating a live map that was filed by delegated-work-flight-plan.

Do not use this to invent a plan (file one first) or to apply pause/kill (steer-running-plan). After the run ends, offer agent-run-audit-trail if they want to scrub history.

## Steps

1. **Get the log.** Prefer the append-only event list for this run. If you only have chat memory, say so, then reconstruct as honestly as you can and mark it unofficial.

2. **Fold in order.** `seq` ascending. Operational events update a node in place. Structural events may change the graph and add a card. Do not skip failed or killed nodes.

3. **Render the board.** Run `scripts/mission_status.py` as shipped (or the temp copy your host writes). Do not retype or shorten it.

   ```
   python3 scripts/mission_status.py path/to/events.json
   ```

   If you cannot run Python, print the same layout by hand from the rules below.

4. **Show phase and honesty.** `proposed`, `executing`, `gated`, or `finished`. If the process died, the last event must be `run_finished` with `aborted`. If that event is missing, say the run looks crashed and close it as aborted. Never keep a spinner on a dead worker.

5. **Group by branch.** Each branch is a column (or a section). Inside it, list nodes with status:

   `proposed | pending | running | blocked | paused | done | failed | killed`

   Put counters on the same line (`found=47 reviewed=12`). Put output summaries one click down, not as new nodes.

6. **Keep the feed small.** Only structural events become cards: plan approved, amendment (with evidence), intervention, gate, finished. A healthy run has about 5 to 15 cards. Do not card every retry.

7. **Call out waits.** If a branch is paused, say which one. If a gate is open, say how many items need a decision and stop nagging about the rest of the map.

8. **Refresh from the log**, not from a parallel "status" object that can drift. The board is the fold. If you need a picture, feed the current plan plus runtime into `render_plan.py` from delegated-work-flight-plan so node tints match status.

## Board layout (text)

```
PHASE     executing
OUTCOME   live
PAUSED    product-research

BRANCH code-research
  [done    ] Read current auth  files=12  Found 12 auth-related files.
  [pending ] Check SSO vendor

BRANCH product-research
  [paused  ] Read product constraints

PROGRESS  1/5 terminal, 0 running

ANNOTATIONS (structural only)
  - Branch paused: product-research
  - New branch: SSO vendor check | evidence: 3 of 12 auth files import the SSO client.
```

## Parallelism rules

- Independent branches run together. A pause on one does not freeze the others.
- A node starts only when every upstream node is terminal and at least one upstream is `done`. If every input died, the node is `killed`, not left pending forever.
- Counters tick. Retries stay inside the node. That is the whole point of operational vs structural.

## Example

User: "How are the login-research agents doing?"

You: fold the log, print the board, mention the paused product-research branch and the SSO amendment with its evidence. Do not paste every file path from `node_output.raw` unless they ask.

Worked log: `assets/example-events.json`.

## Boundaries

- Do not flood the board with tool traces.
- Do not hide killed work.
- Do not report "almost done" without numbers from counters or terminal counts.
- Do not keep a finished run in `executing`.
- Helper scripts are Python 3 stdlib only.
