# Audit trail

Replay is free if you kept an append-only log. The live map and the history scrubber are the same reducer. To go back in time, fold a prefix of the log. Do not keep a second "current state" database that can drift.

## Log file

Save events as a JSON array or JSONL, one object per line. Each object needs:

- `id` unique
- `ts` unix milliseconds
- `seq` integer, starts at 0, never reused
- `type` and `tier`

Never edit a past event. If the process crashes, append `run_finished` with `outcome: "aborted"` and a sentence that says the map is the trail of what actually ran. A dead run that still looks live is a lie.

## What to export

When the user asks for an audit file, export the raw log, not a paraphrase. The raw log is the source of truth. A summary is allowed next to it, not instead of it.

Name the file `audit-trail-<run-id>.json`.

## Scrubbing

Structural events are the ticks on the timeline:

- plan proposed, approved, amended
- gate opened or resolved
- intervention
- run finished

Operational events (status, counters, output) fill in the nodes between ticks. When the user jumps to a mark, fold every event with `seq` less than or equal to that mark, then print the board.

## What not to do

- Do not drop failed or killed nodes from the exported graph.
- Do not collapse retries into a single fake success without leaving the counters in the log.
- Do not reconstruct a plan from chat memory if a log file exists.
- Do not mark an aborted run completed.
