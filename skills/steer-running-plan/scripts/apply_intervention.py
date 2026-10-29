#!/usr/bin/env python3
"""Apply one steering intervention to a plan JSON file.

Prints the updated plan (and any mutation) as JSON. Does not talk to a server.
Self-contained. Run it unchanged.

Examples:
  python3 apply_intervention.py --plan plan.json --action pause_branch --branch web-research
  python3 apply_intervention.py --plan plan.json --action edit_instructions --node-id web-verify --instructions "Drop stale listings."
  python3 apply_intervention.py --plan plan.json --action move_gate --node-id review-gate --after-node-id web-verify
"""
from __future__ import annotations

import argparse
import json
import sys
from copy import deepcopy
from typing import Any

ACTIONS = {
    "approve_plan",
    "pause_branch",
    "resume_branch",
    "kill_branch",
    "edit_instructions",
    "move_gate",
}


def node_ids(plan: dict[str, Any]) -> set[str]:
    return {n["id"] for n in plan.get("nodes", []) if "id" in n}


def find_node(plan: dict[str, Any], nid: str) -> dict[str, Any] | None:
    for n in plan.get("nodes", []):
        if n.get("id") == nid:
            return n
    return None


def branches(plan: dict[str, Any]) -> set[str]:
    return {n.get("branch") for n in plan.get("nodes", []) if n.get("branch")}


def apply_mutation(plan: dict[str, Any], mutation: dict[str, Any]) -> dict[str, Any]:
    next_plan = deepcopy(plan)
    remove_n = set(mutation.get("removeNodeIds") or [])
    remove_e = set(mutation.get("removeEdgeIds") or [])
    next_plan["nodes"] = [n for n in next_plan.get("nodes", []) if n.get("id") not in remove_n]
    next_plan["nodes"].extend(mutation.get("addNodes") or [])
    next_plan["edges"] = [e for e in next_plan.get("edges", []) if e.get("id") not in remove_e]
    next_plan["edges"].extend(mutation.get("addEdges") or [])
    return next_plan


def has_cycle(plan: dict[str, Any]) -> bool:
    ids = node_ids(plan)
    adj: dict[str, list[str]] = {i: [] for i in ids}
    for e in plan.get("edges", []):
        src, tgt = e.get("source"), e.get("target")
        if src in adj and tgt in ids:
            adj[src].append(tgt)
    state: dict[str, int] = {}

    def visit(nid: str) -> bool:
        s = state.get(nid, 0)
        if s == 1:
            return True
        if s == 2:
            return False
        state[nid] = 1
        if any(visit(nxt) for nxt in adj.get(nid, [])):
            return True
        state[nid] = 2
        return False

    return any(visit(i) for i in ids)


def move_gate_mutation(plan: dict[str, Any], gate_id: str, after_id: str) -> dict[str, Any]:
    remove_edge_ids: list[str] = []
    add_edges: list[dict[str, Any]] = []
    edges = plan.get("edges", [])

    incoming = [e for e in edges if e.get("target") == gate_id]
    outgoing = [e for e in edges if e.get("source") == gate_id]

    for in_edge in incoming:
        remove_edge_ids.append(in_edge["id"])
        for out_edge in outgoing:
            if in_edge.get("source") != out_edge.get("target"):
                add_edges.append(
                    {
                        "id": f"bridge-{in_edge['source']}-{out_edge['target']}",
                        "source": in_edge["source"],
                        "target": out_edge["target"],
                    }
                )
    for out_edge in outgoing:
        remove_edge_ids.append(out_edge["id"])

    remove_set = set(remove_edge_ids)
    anchor_out = [
        e
        for e in edges
        if e.get("source") == after_id and e.get("target") != gate_id and e.get("id") not in remove_set
    ]
    for e in anchor_out:
        remove_edge_ids.append(e["id"])
        add_edges.append(
            {
                "id": f"gate-out-{gate_id}-{e['target']}",
                "source": gate_id,
                "target": e["target"],
                **({"label": e["label"]} if e.get("label") else {}),
            }
        )
    add_edges.append({"id": f"gate-in-{after_id}-{gate_id}", "source": after_id, "target": gate_id})

    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for e in add_edges:
        key = (e["source"], e["target"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(e)

    return {
        "addNodes": [],
        "addEdges": deduped,
        "removeNodeIds": [],
        "removeEdgeIds": remove_edge_ids,
    }


def fail(msg: str) -> int:
    print(json.dumps({"ok": False, "error": msg}, indent=2))
    return 1


def main() -> int:
    p = argparse.ArgumentParser(description="Apply one plan intervention")
    p.add_argument("--plan", required=True, help="Path to plan JSON")
    p.add_argument("--action", required=True, choices=sorted(ACTIONS))
    p.add_argument("--branch")
    p.add_argument("--node-id")
    p.add_argument("--after-node-id")
    p.add_argument("--instructions")
    p.add_argument("--approved", action="store_true", help="Plan was already approved (blocks move_gate)")
    args = p.parse_args()

    try:
        with open(args.plan, encoding="utf-8") as f:
            plan = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return fail(f"cannot read plan: {exc}")

    action = args.action
    event: dict[str, Any] = {"type": "intervention", "tier": "structural", "action": action}
    mutation = None
    next_plan = deepcopy(plan)

    if action in {"pause_branch", "resume_branch", "kill_branch"}:
        if not args.branch:
            return fail("branch is required")
        if args.branch not in branches(plan):
            return fail(f"unknown branch: {args.branch}. known: {sorted(branches(plan))}")
        event["branch"] = args.branch

    elif action == "edit_instructions":
        if not args.node_id or args.instructions is None:
            return fail("node-id and instructions are required")
        node = find_node(plan, args.node_id)
        if not node:
            return fail("unknown node")
        next_plan["nodes"] = [
            {**n, "instructions": args.instructions} if n.get("id") == args.node_id else n
            for n in plan.get("nodes", [])
        ]
        event["nodeId"] = args.node_id
        event["instructions"] = args.instructions

    elif action == "move_gate":
        if args.approved:
            return fail("gate can only be moved before approval")
        if not args.node_id or not args.after_node_id:
            return fail("node-id (gate) and after-node-id are required")
        gate = find_node(plan, args.node_id)
        if not gate or gate.get("kind") != "human_gate":
            return fail("not a human gate")
        if not find_node(plan, args.after_node_id):
            return fail("unknown anchor node")
        if args.node_id == args.after_node_id:
            return fail("gate cannot follow itself")
        mutation = move_gate_mutation(plan, args.node_id, args.after_node_id)
        next_plan = apply_mutation(plan, mutation)
        if has_cycle(next_plan):
            return fail("gate move would break the plan: plan graph contains a cycle")
        ids = node_ids(next_plan)
        for e in next_plan.get("edges", []):
            if e.get("source") not in ids or e.get("target") not in ids:
                return fail("gate move would break the plan: dangling edge")
        event["nodeId"] = args.node_id
        event["afterNodeId"] = args.after_node_id
        event["mutation"] = mutation

    elif action == "approve_plan":
        pass

    out = {"ok": True, "action": action, "event": event, "plan": next_plan}
    if mutation is not None:
        out["mutation"] = mutation
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
