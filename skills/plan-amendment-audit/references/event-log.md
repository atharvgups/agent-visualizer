# Event log

Append-only JSONL. One event per line. `seq` starts at 0 and increases by 1.

Every event:

```json
{ "id": "evt-...", "ts": 1730000000000, "seq": 0, "type": "...", "tier": "structural" }
```

`tier` is `structural` or `operational`.

## Structural types

### plan_proposed

```json
{ "type": "plan_proposed", "tier": "structural", "plan": { } }
```

### plan_approved

```json
{ "type": "plan_approved", "tier": "structural" }
```

### plan_amendment

```json
{
  "type": "plan_amendment",
  "tier": "structural",
  "change": "New branch: Chinese social discovery",
  "reason": "Verified findings are disproportionately announced on Chinese-language platforms; the current branches would miss them.",
  "evidence": "38% of verified events so far came from Chinese-language sources (26 verified findings inspected).",
  "mutation": {
    "addNodes": [
      {
        "id": "zh-social-dive",
        "kind": "source",
        "label": "Chinese social deep-dive",
        "summary": "Search Xiaohongshu and WeChat directly.",
        "instructions": "Search those platforms for side-event announcements; verify against organizer accounts.",
        "agent": "social-research",
        "branch": "social-research"
      }
    ],
    "addEdges": [
      { "id": "e-zh-in", "source": "web-verify", "target": "zh-social-dive", "label": "38% zh sources" },
      { "id": "e-zh-merge", "source": "zh-social-dive", "target": "merge-events" }
    ],
    "removeNodeIds": [],
    "removeEdgeIds": []
  }
}
```

### gate_opened / gate_resolved

See the steer-running-plan skill. Both are structural.

### intervention

See the steer-running-plan skill. Human actions on the same bus.

### run_finished

```json
{
  "type": "run_finished",
  "tier": "structural",
  "outcome": "completed",
  "summary": "7 step(s) completed, 1 killed. The map above is the audit trail of what actually ran."
}
```

`outcome` is `completed` or `aborted`.

## Operational types

```json
{ "type": "node_status", "tier": "operational", "nodeId": "web-search", "status": "running" }
```

```json
{ "type": "node_progress", "tier": "operational", "nodeId": "web-verify", "counters": { "reviewed": 12, "verified": 4 } }
```

```json
{ "type": "node_output", "tier": "operational", "nodeId": "web-search", "summary": "Found 42 candidates.", "raw": "{...}" }
```

Statuses: `proposed`, `pending`, `running`, `blocked`, `paused`, `done`, `failed`, `killed`.

## Scrubbing

To show the run at event 15, fold events with `seq <= 15` and draw that state. Do not keep a parallel snapshot store. The log is the store.
