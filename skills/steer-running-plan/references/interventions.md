# Mid-run interventions

All human actions ride the same event bus as agent adaptations, so the audit trail does not split into "the agent did this" and "the user did that." Apply one action at a time. Write it down. Then continue.

## Allowed actions

| action | When | Required fields | Effect |
| --- | --- | --- | --- |
| approve_plan | Phase is proposed | none | Plan becomes the live graph. Nodes go pending. Work may start. |
| move_gate | Before approval only | nodeId (the gate), afterNodeId | Rewire the gate to sit after the anchor. Graph must stay a DAG. |
| pause_branch | Live run | branch | Workers on that branch checkpoint and wait. Other branches keep going. |
| resume_branch | Branch is paused | branch | Clear the pause and reschedule ready nodes. |
| kill_branch | Live run | branch | Mark remaining nodes on that branch killed. Downstream nodes with no live inputs die too. |
| edit_instructions | Any time after propose | nodeId, instructions | Replace that node's instructions. Loops re-read them on the next pass. |
| resolve_gate | A gate is open | decisions[] | Each item is approved, edited, or rejected. Edited text becomes the new content. |

## Gate decisions

```json
{
  "itemId": "draft-2",
  "action": "approved | edited | rejected",
  "editedContent": "only when action is edited"
}
```

If any item was edited, attach a preference note on the gate node so later loops copy the tone and structure.

## Plan amendments (agent-initiated)

The agent may change the graph only with a structural event:

```json
{
  "type": "plan_amendment",
  "change": "short title for the map card",
  "reason": "why the current graph would miss something",
  "evidence": "measured fact, not a vibe",
  "mutation": {
    "addNodes": [],
    "addEdges": [],
    "removeNodeIds": [],
    "removeEdgeIds": []
  }
}
```

Refuse silent rewrites. If you cannot name evidence, do not amend. A healthy run emits about 5 to 15 structural events, not hundreds.

## Status codes that block interventions

- Unknown branch or node: refuse.
- Run is not live (finished or aborted): refuse. Do not pretend it is running.
- `move_gate` after approval: refuse. Ask for a new plan instead.
- Kill is not pause. Kill is terminal for that workstream.
