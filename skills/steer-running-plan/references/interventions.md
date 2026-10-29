# Intervention field cheat sheet

All interventions are structural events. They use the same envelope as every other run event: `id`, `ts` (unix ms), `seq` (monotonic int), `type: "intervention"`, `tier: "structural"`.

## Envelope

```json
{
  "id": "evt-...",
  "ts": 1730000000000,
  "seq": 12,
  "type": "intervention",
  "tier": "structural",
  "action": "pause_branch",
  "branch": "social-research"
}
```

## Action payloads

| action | fields |
|--------|--------|
| `approve_plan` | none |
| `pause_branch` | `branch` |
| `resume_branch` | `branch` |
| `kill_branch` | `branch` |
| `edit_instructions` | `nodeId`, `instructions` |
| `move_gate` | `nodeId` (the gate), `afterNodeId`, `mutation` |

`mutation` for `move_gate` is the same shape as a plan amendment:

```json
{
  "addNodes": [],
  "addEdges": [{ "id": "gate-in-web-verify-review-gate", "source": "web-verify", "target": "review-gate" }],
  "removeNodeIds": [],
  "removeEdgeIds": ["e7"]
}
```

Rewiring rules for `move_gate`:

1. Remove edges into and out of the gate.
2. Bridge the gap the gate left (old predecessor to old successor).
3. Splice the gate after the anchor: anchor to gate, gate to the nodes the anchor used to feed.

Validate the result as a DAG before accepting it. Gate moves are refused once the plan is approved.

## Gate decisions

Not an `intervention` action. Emitted as `gate_resolved`:

```json
{
  "type": "gate_resolved",
  "tier": "structural",
  "nodeId": "review-gate",
  "decisions": [
    { "itemId": "draft-1", "action": "approved" },
    { "itemId": "draft-2", "action": "edited", "editedContent": "shorter pitch..." },
    { "itemId": "draft-3", "action": "rejected" }
  ],
  "preferenceNote": "Prefer shorter pitches with a named audience."
}
```

`editedContent` is required when `action` is `edited`.

## Errors the human should see

| Situation | Message |
|-----------|---------|
| Plan already approved | `plan already approved` |
| Gate move after launch | `gate can only be moved before approval` |
| Unknown branch | `unknown branch` plus the real branch names |
| Unknown node | `unknown node` |
| No gate waiting | `no gate is waiting` |
| Move would cycle or drop edges | `gate move would break the plan: ...` |

Interventions on a run that is no longer live are a conflict. Say the run ended (completed or aborted) and refuse. Do not apply steering to a dead process and then draw it as live.
