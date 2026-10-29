---
name: steer-running-plan
description: Lets a human pause, kill, or re-instruct a live agent plan, move a review gate, and approve or edit work waiting at a checkpoint. Use when the user wants to steer a running agent, stop a branch, change instructions mid-run, or review gated drafts.
summary: Steer a live plan without breaking the diagram. Pause or kill a branch, edit instructions, move the gate, or resolve a checkpoint. Every action lands on the same event log as the agent's own work.
version: "1.0.0"
tags:
  - agents
  - orchestration
  - interventions
  - human-in-the-loop
keywords:
  - pause branch
  - kill branch
  - human gate
  - steer agent
use_cases:
  - A parallel research branch is wasting time and the user wants it killed
  - Drafts are waiting and the user wants to approve, edit, or reject each one
  - The user wants the review checkpoint earlier in the pipeline before launch
---

# Steer a running plan

The map is the control surface. When the user steps in, you apply one named intervention, write it on the event log, and keep the graph honest. Do not quietly change instructions or drop a branch.

Read `references/interventions.md` first.

## When to use

- The user says pause, resume, kill, stop that branch, or leave the other one running.
- The user wants different instructions on a node that is still looping.
- The user wants the review gate moved before they approve the plan.
- A human_gate is open and items need approve, edit, or reject.
- The agent itself needs to grow the graph. That is a `plan_amendment`, not a silent rewrite.

Do not use this to file the first plan (use delegated-work-flight-plan) or to print status (use parallel-agent-mission-control).

## Steps

1. **Load the live plan.** You need the current plan JSON and, if you have it, the event log. If the run is finished or aborted, stop. Interventions on a dead run are a hard no.

2. **Name the action.** Pick exactly one:
   - `approve_plan`
   - `move_gate` (before approval only)
   - `pause_branch` / `resume_branch`
   - `kill_branch`
   - `edit_instructions`
   - `resolve_gate`
   - `plan_amendment` (agent-initiated, needs evidence)

3. **Check the target exists.** Unknown `branch` or `nodeId` is an error. Say so. Do not guess.

4. **Apply it.** For graph edits, run the helper rather than rewiring by eye. Invoke `scripts/apply_intervention.py` as shipped (or the temp copy your host writes). Do not retype or shorten it.

   ```
   python3 scripts/apply_intervention.py plan.json intervention.json
   ```

   Pause, resume, and kill do not change the JSON shape. They change runtime. Still record the intervention event.

5. **Write the event.** Same bus as everything else. Include `action`, and the branch or node you touched. For `edit_instructions`, store the new text. For `move_gate`, store `afterNodeId` and the mutation.

6. **Honor it on the next checkpoint.** Workers must notice pause and kill between units of work, not only at node start. Loops re-read `instructions` each pass so a mid-run edit actually lands.

7. **Tell the user what changed** in map language: which branch is paused, which node has new instructions, which items were rejected. Then show the updated map or the waiting gate. Do not resume other work they did not ask to touch.

## Human gate

When a gate opens, execution on that path is blocked. Present every item with its title and full content. For each item the user must choose approved, edited, or rejected. You do not pick for them.

If they edited any item, attach a preference note to the node, such as: "User edited 2 draft(s). Future drafts should follow the edited versions' tone and structure." Downstream loops should follow that note.

Nothing externally visible ships from a gate until every item has a decision.

## Moving the gate

Only before `approve_plan`. The gate node is spliced to sit immediately after `afterNodeId`. The helper refuses cycles. After approval, the graph is live: ask for a new plan instead of dragging the gate around.

## Agent amendments

If measured evidence shows the current graph will miss work, emit `plan_amendment` with:

- `change`: short title for the card ("New branch: SSO vendor check")
- `reason`: why the current branches would miss it
- `evidence`: a number or a cited fact, not a hunch
- `mutation`: add/remove nodes and edges

If you cannot name evidence, do not amend. A healthy run has a handful of structural cards, not a stream of them.

## Kill vs pause

Pause waits. Kill is terminal for that workstream. Downstream nodes whose inputs all died are killed too. Do not un-kill.

## Example

User: "Kill the product-research branch, and make the drafts lead with risk."

You: confirm the branch name from the plan, apply `kill_branch`, apply `edit_instructions` on the drafting loop, record both events, and continue the other branches. Do not also rewrite the merge node unless they asked.

Example files: `assets/example-plan.json`, `assets/example-intervention.json`.

## Boundaries

- One intervention at a time in the helper. Batch only in the event log after each apply succeeds.
- Do not implement "just this once" side channels that skip the log.
- Do not treat chat agreement as `approve_plan`. Call the action by name.
- Helper scripts are Python 3 stdlib. If Python is missing, follow `references/interventions.md` by hand and still write the events.
