# Status board reference

## Folded run state

```json
{
  "phase": "executing",
  "live": true,
  "plan": {},
  "nodeRuntime": {
    "web-search": {
      "status": "done",
      "counters": { "found": 42 },
      "outputSummary": "Found 42 candidate items via web."
    },
    "web-verify": {
      "status": "running",
      "counters": { "reviewed": 20, "verified": 6 },
      "note": "checking organizer pages"
    }
  },
  "annotations": [
    {
      "eventId": "evt-3",
      "ts": 1730000003000,
      "title": "Plan approved",
      "body": "Execution started.",
      "kind": "lifecycle"
    }
  ],
  "openGate": null,
  "pausedBranches": [],
  "outcome": null,
  "outcomeSummary": null
}
```

`live` is not in the event log. It is true only while a worker process is still subscribed. After a crash, fold the log, then set `live: false` and append aborted if the log has no `run_finished`.

## How to fold

Start from:

- `phase: planning`
- empty `nodeRuntime`, `annotations`, `pausedBranches`
- `plan: null`, `openGate: null`

Then, in `seq` order:

| event | state change |
|-------|----------------|
| `plan_proposed` | `phase=proposed`, store `plan`, every node `proposed` |
| `plan_approved` | `phase=executing`, every node `pending`, lifecycle card |
| `plan_amendment` | apply mutation to `plan`, new nodes `pending`, amendment card with `evidence` |
| `node_status` | overwrite that node's status |
| `node_progress` | merge counters, optional note |
| `node_output` | set `outputSummary` / `outputRaw` |
| `gate_opened` | `phase=gated`, set `openGate`, gate card |
| `gate_resolved` | `phase=executing`, clear `openGate`, store `preferenceNote`, gate card |
| `intervention` | apply mutation if present; edit instructions; add/remove paused branch; intervention card |
| `run_finished` | `phase=finished`, `outcome`, `outcomeSummary`, lifecycle card |

Replay is the same fold over a prefix of the log. There is no second code path.

## Annotation copy

Keep titles short. Put evidence on amendments only.

| kind | title examples |
|------|----------------|
| lifecycle | Plan approved, Run finished |
| amendment | New branch: Chinese social discovery |
| intervention | Branch paused: social-research |
| gate | Waiting for your review, Human review complete |

## Suggested JSONL

One event per line. Same fields as the event objects above plus `id`, `ts`, `seq`. Name the file `events.jsonl` next to `plan.json`.
