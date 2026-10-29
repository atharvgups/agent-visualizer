---
name: agent-run-audit-trail
description: Replays a finished or live agent run from its append-only event log so you can see how the plan became what actually ran, then export the raw trail. Use when the user asks for a replay, audit, timeline scrub, or to export what happened.
summary: Replay is folding a prefix of the event log. Scrub to structural marks, show the map at that point, and export the raw JSON. Never rewrite history or mark an aborted run as completed.
version: "1.0.0"
tags:
  - agents
  - audit
  - replay
  - observability
keywords:
  - audit trail
  - event log
  - timeline replay
  - aborted run
use_cases:
  - The user wants to know how an extra branch appeared mid-run
  - Someone asks for an export of what the agents actually did
  - A run crashed and you need an aborted marker instead of a fake success
---

# Agent run audit trail

The log is the product. Live status and replay use the same fold. To see the past, take a prefix of the events and reduce it. Do not tell a cleaner story than the file.

Read `references/audit-log.md` first.

## When to use

- The user asks what actually ran, how we got here, or to replay / scrub the timeline.
- The user wants an audit file for a run.
- The process crashed and the map must not look live.

Do not use this to invent the first plan or to steer a live branch.

## Steps

1. **Find the log.** A JSON array or an object with an `events` field. If none exists, say you cannot audit from chat memory alone, then offer to start logging on the next run.

2. **Do not edit it.** No deleting failures, no collapsing retries into a success, no back-dating. If the worker died, append one `run_finished` event with `outcome: "aborted"` and a sentence that names what completed and what did not.

3. **List the structural marks.** Those are the ticks on the timeline: plan proposed, approved, amended, gate opened or resolved, intervention, finished. Operational events sit between ticks.

4. **Replay to the requested point.** Run `scripts/replay_log.py` as shipped (or the temp copy your host writes). Do not retype or shorten it.

   ```
   python3 scripts/replay_log.py path/to/events.json
   python3 scripts/replay_log.py path/to/events.json --until 10
   python3 scripts/replay_log.py path/to/events.json --until-type plan_amendment
   python3 scripts/replay_log.py path/to/events.json --until 10 --export-prefix /tmp/state-at-10.json
   ```

   `--until` is inclusive on `seq`. The helper prints phase, nodes and status at that point, and which marks are already in the past.

5. **Show the map at that point**, not only a paragraph. If you have the plan JSON from the fold, render it. Mention amendments with their evidence so a new branch does not look like it was always there.

6. **Export on request.** Write the raw log as `audit-trail-<run-id>.json`. A short summary may ride along. The file is the source of truth.

7. **Jump back to live** by folding the full log, not by keeping a second current-state cache.

## What a finished run should say

Completed: how many steps `done`, how many `killed` or `failed`.

Aborted: the run stopped short. Say that plainly. Example: "1 step completed, rest stopped after the product-research pause. The map above is the audit trail of what actually ran."

## Example

User: "Why did an SSO branch show up? Export the trail."

You: replay `--until-type plan_amendment`, read the reason and evidence from that event, show the map with the new node, then write `audit-trail-run-1.json` containing the untouched log.

Worked log: `assets/example-events.json`.

## Boundaries

- Do not reconstruct a plan from memory when a log exists.
- Do not drop killed or failed nodes from the export.
- Do not mark aborted as completed.
- Do not put the summary in place of the raw file.
- Helper scripts are Python 3 stdlib. If Python is missing, fold the prefix by hand using `references/audit-log.md`.
