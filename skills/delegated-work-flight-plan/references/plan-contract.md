# Plan-as-data contract

The plan JSON is the diagram and the execution graph. An orchestrator (or a coding agent following this skill) may only leave the graph by emitting a `plan_amendment` with a mutation, a reason, and evidence. Never narrate work that is not a node.

## Shape

```json
{
  "id": "string",
  "prompt": "original user request",
  "interpretation": "one paragraph: how you understood the goal",
  "nodes": [
    {
      "id": "stable-slug",
      "kind": "source | transform | store | decision | human_gate | loop",
      "label": "short human name for the map",
      "summary": "one sentence for the drawer",
      "instructions": "what the worker actually does, including tools",
      "agent": "conceptual sub-agent name",
      "branch": "workstream a human can pause or kill"
    }
  ],
  "edges": [{ "id": "e1", "source": "a", "target": "b", "label": "optional" }],
  "approvalGates": ["ids of human_gate nodes, in order"],
  "loops": [{ "nodeId": "draft", "until": "human-readable stop", "maxIterations": 3 }]
}
```

## Node kinds (fixed ontology)

| kind | Meaning | Typical work |
| --- | --- | --- |
| source | Gathers from outside this run | repo search, web, APIs, logs |
| transform | Reshapes, filters, drafts | verify, summarize, rewrite |
| store | Accumulates results | merge, package, write a file |
| decision | Agent-made branch point | pick top N, choose an approach |
| human_gate | Blocks until a human decides | review drafts, approve a PR plan |
| loop | Repeats until a condition | draft one item per pick |

Do not invent extra kinds. Map every unit of work onto these six.

## Rules

1. The graph is a DAG. Model repetition with a `loop` entry, never a cycle.
2. `label` is what a human would say ("Find auth code"). Technical guts live in `instructions`.
3. `branch` groups nodes so pause and kill target a whole workstream.
4. Put a `human_gate` before anything externally visible (send, submit, publish, open a PR, deploy).
5. Trivial tasks (one agent, under four real steps) get a 1-3 node linear plan. Branchy work aims for 8-12 nodes. A node is work a human recognizes, not an implementation micro-step.
6. `id` values stay stable for the life of the run so status, interventions, and the audit log can point at them.
