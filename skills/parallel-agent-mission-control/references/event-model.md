# Two-tier event model

One append-only log drives the live map, the status board, and later replay. Human interventions use the same bus as agent work.

## Tiers

**Structural** events mutate the graph or are worth a card on the map. A healthy run emits about 5 to 15 of these, not hundreds.

- `plan_proposed` (carries the full plan)
- `plan_approved`
- `plan_amendment` (change, reason, evidence, mutation)
- `gate_opened` / `gate_resolved`
- `intervention` (pause, resume, kill, edit, move_gate, approve_plan)
- `run_finished` (outcome: completed or aborted)

**Operational** events only update state inside existing nodes. They do not add cards.

- `node_status` (proposed, pending, running, blocked, paused, done, failed, killed)
- `node_progress` (counters such as `{ "reviewed": 412, "verified": 2 }`, optional note)
- `node_output` (plain-language summary plus raw detail below the fold)

Every event has `id`, `ts` (unix ms), `seq` (monotonic integer starting at 0), `type`, and `tier`.

## Phase

Fold the log in order:

| Last structural signal | Phase |
| --- | --- |
| none | planning |
| plan_proposed | proposed |
| plan_approved (and no open gate) | executing |
| gate_opened | gated |
| run_finished | finished |

## Honesty rules

- The board shows the folded prefix of the log. It never invents nodes that are not in the plan.
- If the process dies mid-run, close with `run_finished` / `aborted`. Never leave a dead run looking live.
- Parallel branches are independent workstreams. Show each branch as a column. A pause on one branch does not freeze the others.
- Counters tick in place. Do not spawn a new node per retry or per item counted.
- Annotation cards are for structural events only.
