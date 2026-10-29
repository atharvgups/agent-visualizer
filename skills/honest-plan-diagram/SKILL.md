---
name: honest-plan-diagram
description: "Turn a user prompt into a reviewable multi-agent plan diagram before any subagent starts. Use when delegating work to parallel agents, when the user asks to see the plan as a map, when proposing a flight plan of sources, transforms, stores, decisions, human gates, and loops, or when a task is about to spawn subagents. Do not start work until the human approves."
summary: "Show the plan as a diagram first. The graph is the contract the agent will actually run, not a caption of work happening somewhere else."
version: "1.0.0"
tags:
  - planning
  - multi-agent
  - diagrams
  - subagents
  - mermaid
keywords:
  - plan graph
  - honest diagram
  - human gate
  - delegated work
  - proposed plan
use_cases:
  - "User asks you to research, draft, or ship something that needs more than one agent"
  - "User wants to review the plan as a map before anything runs"
  - "You are about to spawn subagents and need a shared contract"
---

# Honest plan diagram

You are proposing a flight plan, not narrating work you already started.

The plan JSON is both the picture the human sees and the contract you will execute. Do not describe work you would not actually perform. Do not start any node until the human approves.

## When to use

Use this skill when:

- The user is delegating multi-step work to you or to subagents
- They ask to see the plan, the map, the diagram, or the flight plan first
- The job has parallel research, drafting, or review streams
- You would otherwise jump straight into tool calls and lose the human

Skip it when the request is a single short action (summarize, translate, rewrite, explain, define, convert, or under five words). Then use the complexity gate below and return a tiny linear plan instead of a branchy system.

## Node ontology

Map every piece of work onto exactly these six kinds. Invent nothing else.

| Kind | Meaning | Example label |
|------|---------|----------------|
| `source` | Gathers information from the outside world | Find events on the web |
| `transform` | Reshapes, filters, verifies, or drafts | Verify relevance |
| `store` | Accumulates results | Merge verified events |
| `decision` | Agent-made branch point | Prioritize opportunities |
| `human_gate` | Execution blocks until a human decides | Your review |
| `loop` | Repeats until a condition is met | Draft applications |

Labels are human-level names. Never put API names, tokens, or parser details in `label`. That guts belongs in `instructions`.

Group nodes with `branch` so a human can later pause or kill a whole workstream. Give each node an `agent` name for who owns it (for example `web-research`, `drafting`).

## Complexity gate

If the task is a single-agent job of fewer than four recognizable steps, return a minimal linear plan of 1 to 3 nodes. Do not invent fake parallelism.

A node is a unit of work a human would recognize ("Search the web for side events"), not an implementation step ("parse HTML").

For genuinely branchy work, aim for 8 to 12 nodes.

## Plan JSON

Produce one JSON object and nothing else as the machine form. Keep a copy on disk if the user has a workspace (`plan.json` next to the run, or wherever they asked).

```json
{
  "id": "run-id",
  "prompt": "original user prompt",
  "interpretation": "one paragraph of how you understood the goal",
  "nodes": [
    {
      "id": "web-search",
      "kind": "source",
      "label": "Find events on the web",
      "summary": "Plain-language sentence of what this node does",
      "instructions": "The executing sub-agent follows this. Editable later.",
      "agent": "web-research",
      "branch": "web-research"
    }
  ],
  "edges": [{ "id": "e1", "source": "web-search", "target": "web-verify" }],
  "approvalGates": ["review-gate"],
  "loops": [{ "nodeId": "draft-applications", "until": "until every priority event has a draft", "maxIterations": 8 }]
}
```

Rules:

- The graph must be a DAG. Model repetition with a `loop` entry, not a cycle.
- Include at least one `human_gate` before any externally visible output (sending, submitting, publishing, posting, mailing).
- `approvalGates` lists those node ids in execution order.
- Every edge `source` and `target` must be a real node id.
- Node ids are unique, lowercase, hyphenated.

Full field notes live in [references/plan-schema.md](references/plan-schema.md). A worked example is in [references/example-plan.json](references/example-plan.json).

## Validate before you show it

Run the bundled checker on the JSON. Do not retype the script. Write it to a temp file if you must, then run it unchanged.

```bash
python3 scripts/validate_plan.py plan.json
```

Or pipe stdin:

```bash
python3 scripts/validate_plan.py < plan.json
```

Exit code 0 means the graph is honest enough to show. Nonzero prints the errors. Fix them before the human sees the map. The script also prints a Mermaid flowchart you can paste.

If Python is missing, walk the same checks by hand: unique ids, known kinds, edges point at real nodes, gates are `human_gate`, no cycles, loops point at real nodes.

## Show the proposed plan

Present, in this order:

1. **How I understood it.** The `interpretation` paragraph. One paragraph, not a restatement of the prompt.
2. **The map.** The Mermaid diagram from the validator (or an equivalent flowchart). Nodes show `label`, `kind`, and `branch`.
3. **What waits on you.** Name the human gate and what it will review. Offer to move it earlier or later before launch: "Move Your review to after [node]?"
4. **What has not happened.** Say plainly that nothing has run yet.

Then stop. Wait for approve, edit, or reject.

Do not spawn subagents. Do not call tools that do the actual work. Do not "get a head start" on the first source node.

## After approval

Once the human approves:

- Treat every node as `pending`
- Execute only this graph
- If you must deviate, you need an explicit plan amendment (mutation, reason, evidence). That is a different skill. Until then, the diagram stays ground truth.

## Common mistakes

- Starting research while "showing the plan" in parallel. The point is that nothing runs yet.
- Using kinds like `agent`, `tool`, or `llm`. Only the six kinds above.
- Putting the human gate after you already sent the email.
- A 20-node map for "summarize this paragraph."
- Cycles in the graph because a loop "feels like" an edge going backwards.
