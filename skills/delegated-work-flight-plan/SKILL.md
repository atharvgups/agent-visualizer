---
name: delegated-work-flight-plan
description: Turns a multi-step or delegated request into an executable plan diagram the human can review before any work starts. Use when the user asks for a flight plan, a live map of sub-agents, a proposed plan, or to see the system before it runs.
summary: File a proposed plan as a diagram first. The JSON is both the picture and the contract. Nothing runs until the human approves it.
version: "1.0.0"
tags:
  - agents
  - planning
  - diagrams
  - orchestration
keywords:
  - flight plan
  - plan graph
  - delegated work
  - honest diagram
use_cases:
  - User asks an agent to research, draft, and ship something with parallel sub-agents
  - User wants to see the plan as a map before any code or emails go out
  - User says show me the flight plan, proposed plan, or live diagram
---

# Delegated work flight plan

You are filing a flight plan, not starting the work. The plan JSON is the diagram and the execution contract. Do not describe work you will not actually perform. Do not start nodes until the user approves the map.

Read `references/plan-contract.md` before you write JSON.

## When to use

- The request needs more than one worker, branch, or checkpoint.
- The user asks to see the plan, the map, the flight plan, or the system before it runs.
- You are about to spawn sub-agents, parallel research, or a long loop.

Do not use this for a one-step ask (summarize this file, rename a symbol, explain a function). For those, do the task. If you are unsure, apply the complexity gate below.

## When not to use

- The user already approved a plan and wants status. Hand off to parallel-agent-mission-control.
- The user wants to pause, kill, or edit a live run. Hand off to steer-running-plan.
- The user wants a replay or export of a finished run. Hand off to agent-run-audit-trail.

## Steps

1. **Complexity gate.** If the prompt is a single-agent task of fewer than four real steps, or it starts with summarize, translate, rewrite, explain, define, or convert, return a linear plan of 1-3 nodes. No fake branches.

2. **Interpret.** Write one paragraph in `interpretation`: how you understood the goal, in the user's language. Put this above the map.

3. **Cut the work into nodes.** Each node is a unit a human would recognize ("Read current auth"), not a micro-step ("parse the JSON"). Aim for 8-12 nodes when the work is genuinely branchy.

4. **Map every node onto the fixed kinds:** `source`, `transform`, `store`, `decision`, `human_gate`, `loop`. Invent no other kinds.

5. **Name for humans.** `label` is the map card. `summary` is one sentence for the drawer. `instructions` hold tools, queries, and file paths. `agent` is the conceptual worker. `branch` is the workstream a human can pause or kill as a unit.

6. **Keep a DAG.** Parallel work is multiple sources feeding a merge `store`. Repetition is a `loop` with `until` and `maxIterations`. Never add a cycle.

7. **Put a human_gate before anything externally visible.** Sending, submitting, publishing, opening a PR, deploying, or emailing must wait. The gate is a node, not a polite sentence in chat.

8. **Write the plan JSON** using the shape in `references/plan-contract.md`. Give every node and edge a stable `id`.

9. **Validate.** Run `scripts/validate_plan.py` as shipped (or the temp copy your host writes). Do not retype or shorten it. Fix every ERROR.

   ```
   python3 scripts/validate_plan.py path/to/plan.json
   ```

10. **Draw the map.** Run `scripts/render_plan.py` and show the Mermaid flowchart plus the interpretation paragraph. Say clearly: proposed plan, nothing has run yet.

11. **Stop.** Ask the user to approve, to move the review gate earlier or later, or to reject the plan. Do not launch workers in the same turn.

## Output the user should see

- The interpretation paragraph.
- The Mermaid map (left to right).
- A short branch list: name, what it does, where it waits.
- Where the human_gate sits, and that they can move it before approval.
- The raw plan JSON in a fenced block or a saved file, so later skills can steer and replay the same object.

## Example

User: "Research current auth, draft two login redesign approaches, and wait for me before changing any code."

You: file a plan with two source branches (code-research, product-research), a merge store, a decision, a drafting loop, a human_gate, and a package store. Validate it. Render it. Wait. Do not edit application code in this turn.

A worked JSON lives in `assets/example-plan.json`.

## Boundaries

- Do not start work because the plan "looks obvious."
- Do not add nodes after the fact without a later `plan_amendment` (that is a different skill).
- Do not put API names, tokens, or HTML parsing in `label`.
- Do not emit 30 nodes. Split into another run if the job is that large.
- Helper scripts use Python 3 from the stdlib only. If Python is missing, validate the same rules by hand from `references/plan-contract.md` and still draw the map.
