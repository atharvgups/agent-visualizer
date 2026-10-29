---
name: steer-running-plan
description: "Steer a live multi-agent plan without stopping the whole run. Use when the user wants to pause, resume, or kill a branch, edit a node's instructions mid-run, move a human review gate before launch, or approve, edit, or reject items waiting at a gate. Applies one intervention at a time and records it on the same event log as the agent's own work."
summary: "Pause, kill, rewrite, or gate a running agent plan from the map. The rest of the work keeps going."
version: "1.0.0"
tags:
  - orchestration
  - interventions
  - human-in-the-loop
  - multi-agent
keywords:
  - pause branch
  - kill branch
  - edit instructions
  - move gate
  - approve plan
use_cases:
  - "A research branch is wasting time and the user wants it stopped"
  - "Drafts are waiting and the user wants to edit one before the rest continue"
  - "The review gate sits too late and should move earlier before launch"
---

# Steer a running plan

The human is not a spectator. They can change the live plan the same way the orchestrator can, and those changes land on the same event bus so the audit trail stays honest.

You already have (or should have) a plan graph with `branch` on every node. If you do not, propose a plan first. This skill is for after a plan exists.

## When to use

Use this skill when the user says things like:

- pause that branch, hold the social sweep, stop drafting for a minute
- kill the web-research stream, drop that workstream
- resume it
- change the instructions on this node
- move the review gate to after verify
- approve the plan, launch it
- approve / edit / reject these drafts

Do not use it to rewrite the whole plan from scratch. That is a new plan. Do not silently ignore a steering request because a subagent is already running.

## The six interventions

Apply exactly one of these per user request. Name it out loud before you do it.

| Action | When | Required fields | Allowed |
|--------|------|-----------------|---------|
| `approve_plan` | Proposed plan, nothing running yet | | Once. After this, nodes go `pending` and execution starts. |
| `move_gate` | Still proposed | `nodeId` (the gate), `afterNodeId` (new anchor) | Only before approval. Re-validate the DAG. |
| `pause_branch` | Executing | `branch` | Running nodes on that branch checkpoint to `paused`. Other branches continue. |
| `resume_branch` | A branch is paused | `branch` | Clears pause and lets pending work start again. |
| `kill_branch` | Executing | `branch` | Every not-finished node on that branch becomes `killed`. Downstream nodes that only needed that input also die. |
| `edit_instructions` | Any time after propose | `nodeId`, `instructions` | Replaces the node's instructions. Already-finished nodes keep their old output. The next (or current, at the next checkpoint) execution of that node uses the new text. |

Human-gate resolution is separate. See below.

Unknown branch names are an error. Do not guess. List the real `branch` values from the plan and ask.

## Checkpoints

A running node must notice pause and kill. If you spawned a subagent:

1. Give it a short checkpoint instruction: stop between units of work and re-read pause/kill state.
2. If the branch is paused, set the node `paused` and wait. Do not keep calling tools.
3. If the branch is killed, set the node `killed` and do not use its partial output as if it were done.
4. Other branches keep going. That is the point.

If a node has no upstream `done` (every input is `killed` or `failed`), mark it `killed` instead of hanging forever.

## Moving a gate (pre-launch only)

The one graph edit allowed before approval is dragging a `human_gate` to sit immediately after another node.

1. Confirm the plan is not approved yet.
2. Confirm `nodeId` is kind `human_gate` and `afterNodeId` exists and is not the gate.
3. Run the bundled script so the rewiring is mechanical, not improvised.

```bash
python3 scripts/apply_intervention.py \
  --plan plan.json \
  --action move_gate \
  --node-id review-gate \
  --after-node-id web-verify
```

4. Show the new map. Wait for approve.

If the script says the move would break the plan, tell the human and keep the old graph.

## Editing instructions

When the user rewrites a step:

- Replace `instructions` on that node only.
- Quote the new instructions back in one sentence so they can see you heard them.
- If the node is currently running, honor the new text at the next checkpoint. Do not restart finished work unless they ask.

```bash
python3 scripts/apply_intervention.py \
  --plan plan.json \
  --action edit_instructions \
  --node-id web-verify \
  --instructions "Also drop anything without a public registration page."
```

## Pause, resume, kill

```bash
python3 scripts/apply_intervention.py --plan plan.json --action pause_branch --branch social-research
python3 scripts/apply_intervention.py --plan plan.json --action resume_branch --branch social-research
python3 scripts/apply_intervention.py --plan plan.json --action kill_branch --branch web-research
```

After kill, say what died and what is still running. Do not pretend killed work finished.

## Resolving a human gate

When a `human_gate` is open, the run is `gated`. Nothing downstream of that node starts until every item has a decision.

For each item the user must pick one:

- `approved` (as written)
- `edited` (plus the new content)
- `rejected`

If they edited anything, attach a short `preferenceNote` to the node ("prefer shorter subject lines") so later drafts can see it. Then continue.

Do not auto-approve because the drafts "look fine."

## Record every intervention

Append a structural `intervention` event with `action`, the ids you used, and a timestamp. Same log as plan amendments and node status. The human stepped in. The map should say so.

Details and a field cheat sheet: [references/interventions.md](references/interventions.md).

## What not to do

- Pause the entire run when they named one branch.
- Kill a branch and then merge its half-finished notes into the store as verified.
- Move a gate after launch.
- Change instructions on every node "to be safe."
- Continue past a gate because you are confident.
