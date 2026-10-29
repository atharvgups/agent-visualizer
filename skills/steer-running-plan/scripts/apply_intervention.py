#!/usr/bin/env python3
"""Apply one steering action to a plan JSON and print the next plan.

Usage:
  python apply_intervention.py plan.json intervention.json

intervention.json shape:
  {"action":"pause_branch","branch":"web-research"}
  {"action":"kill_branch","branch":"web-research"}
  {"action":"resume_branch","branch":"web-research"}
  {"action":"edit_instructions","nodeId":"draft","instructions":"..."}
  {"action":"move_gate","nodeId":"review-gate","afterNodeId":"merge"}

Prints the updated plan JSON on stdout. Pause and kill do not rewrite the
graph; they print the same plan plus a note on stderr. Stdlib only.
"""

from __future__ import annotations

import json
import sys


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} must be a JSON object")
    return data


def node_by_id(plan: dict, nid: str) -> dict | None:
    for n in plan.get("nodes") or []:
        if isinstance(n, dict) and n.get("id") == nid:
            return n
    return None


def branches(plan: dict) -> set[str]:
    return {n.get("branch") for n in plan.get("nodes") or [] if isinstance(n, dict)}


def move_gate(plan: dict, gate_id: str, after_id: str) -> dict:
    gate = node_by_id(plan, gate_id)
    if not gate or gate.get("kind") != "human_gate":
        raise ValueError("nodeId must be a human_gate")
    if node_by_id(plan, after_id) is None:
        raise ValueError("unknown afterNodeId")
    if after_id == gate_id:
        raise ValueError("gate cannot follow itself")

    edges = [e for e in plan.get("edges") or [] if isinstance(e, dict)]
    incoming = [e for e in edges if e.get("target") == gate_id]
    outgoing = [e for e in edges if e.get("source") == gate_id]
    remove = {e.get("id") for e in incoming + outgoing}

    add: list[dict] = []
    for inn in incoming:
        for out in outgoing:
            if inn.get("source") != out.get("target"):
                add.append(
                    {
                        "id": f"bridge-{inn.get('source')}-{out.get('target')}",
                        "source": inn["source"],
                        "target": out["target"],
                    }
                )

    anchor_out = [
        e
        for e in edges
        if e.get("source") == after_id and e.get("target") != gate_id and e.get("id") not in remove
    ]
    for e in anchor_out:
        remove.add(e.get("id"))
        nxt = {"id": f"gate-out-{gate_id}-{e.get('target')}", "source": gate_id, "target": e["target"]}
        if e.get("label"):
            nxt["label"] = e["label"]
        add.append(nxt)
    add.append({"id": f"gate-in-{after_id}-{gate_id}", "source": after_id, "target": gate_id})

    seen: set[tuple[str, str]] = set()
    deduped = []
    for e in add:
        key = (e["source"], e["target"])
        if key in seen or e["source"] == e["target"]:
            continue
        seen.add(key)
        deduped.append(e)

    next_edges = [e for e in edges if e.get("id") not in remove] + deduped
    next_plan = {**plan, "edges": next_edges}
    # cycle check
    ids = [n.get("id") for n in plan.get("nodes") or [] if isinstance(n, dict)]
    adj = {i: [] for i in ids}
    for e in next_edges:
        if e.get("source") in adj and e.get("target") in adj:
            adj[e["source"]].append(e["target"])
    state: dict[str, int] = {}

    def visit(nid: str) -> bool:
        s = state.get(nid, 0)
        if s == 1:
            return True
        if s == 2:
            return False
        state[nid] = 1
        for nxt in adj.get(nid, []):
            if visit(nxt):
                return True
        state[nid] = 2
        return False

    for nid in ids:
        if isinstance(nid, str) and visit(nid):
            raise ValueError("gate move would introduce a cycle")
    return next_plan


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: apply_intervention.py plan.json intervention.json", file=sys.stderr)
        return 2
    try:
        plan = load(sys.argv[1])
        action = load(sys.argv[2])
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1

    name = action.get("action")
    try:
        if name in {"pause_branch", "resume_branch", "kill_branch"}:
            branch = action.get("branch")
            if branch not in branches(plan):
                raise ValueError("unknown branch")
            print(json.dumps(plan, indent=2))
            print(f"NOTE graph unchanged. Record intervention {name} on branch {branch}.", file=sys.stderr)
            return 0
        if name == "edit_instructions":
            nid = action.get("nodeId")
            text = action.get("instructions")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("instructions is required")
            node = node_by_id(plan, nid)
            if node is None:
                raise ValueError("unknown nodeId")
            nodes = []
            for n in plan.get("nodes") or []:
                if isinstance(n, dict) and n.get("id") == nid:
                    nodes.append({**n, "instructions": text})
                else:
                    nodes.append(n)
            print(json.dumps({**plan, "nodes": nodes}, indent=2))
            return 0
        if name == "move_gate":
            nxt = move_gate(plan, action.get("nodeId"), action.get("afterNodeId"))
            print(json.dumps(nxt, indent=2))
            return 0
        raise ValueError(f"unsupported action: {name}")
    except ValueError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
