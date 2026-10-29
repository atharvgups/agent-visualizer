# Plan schema

This is the contract object. Render it. Execute it. Do not keep a second, secret plan.

## Plan

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable run id. |
| `prompt` | string | Original user prompt. |
| `interpretation` | string | One paragraph. How the planner understood the goal. Shown above the map. |
| `nodes` | array | Units of work. |
| `edges` | array | Directed edges. Graph must be a DAG. |
| `approvalGates` | string[] | Node ids of kind `human_gate`, in execution order. |
| `loops` | array | Repetition metadata. Do not encode loops as cycles. |

## Node

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Unique. Lowercase, hyphens. |
| `kind` | enum | `source`, `transform`, `store`, `decision`, `human_gate`, `loop`. |
| `label` | string | Short human name. Never technical guts. |
| `summary` | string | One sentence for a drawer or tooltip. |
| `instructions` | string | What the executing sub-agent follows. Editable mid-run. |
| `agent` | string | Conceptual owner (`web-research`, `drafting`). |
| `branch` | string | Workstream a human can pause or kill as a unit. |

## Edge

| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Unique. |
| `source` | string | Node id. |
| `target` | string | Node id. |
| `label` | string? | Optional. Use for why the edge exists. |

## Loop spec

| Field | Type | Notes |
|-------|------|--------|
| `nodeId` | string | Must exist. Usually kind `loop`. |
| `until` | string | Human-readable stop condition. |
| `maxIterations` | int | Positive. Hard cap. |

## Integrity checks

1. No duplicate node ids.
2. Every edge endpoint exists.
3. Every `approvalGates` id is a node of kind `human_gate`.
4. Every loop `nodeId` exists.
5. No cycles.
6. At least one human gate if the plan produces anything a third party would see.

## Statuses (set after approval, not at propose time)

`proposed`, `pending`, `running`, `blocked`, `paused`, `done`, `failed`, `killed`.

On first propose, every node is `proposed`.
