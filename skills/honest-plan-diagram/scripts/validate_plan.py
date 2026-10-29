#!/usr/bin/env python3
"""Validate a plan-as-data JSON graph and print a Mermaid flowchart.

Reads a path argument or stdin. Exits 0 on success, 1 on validation errors.
Self-contained: this file is the whole checker. Do not rewrite it.
"""
from __future__ import annotations

import json
import sys
from typing import Any

KINDS = {"source", "transform", "store", "decision", "human_gate", "loop"}
REQUIRED_NODE = ("id", "kind", "label", "summary", "instructions", "agent", "branch")
REQUIRED_PLAN = ("id", "prompt", "interpretation", "nodes", "edges", "approvalGates", "loops")


def load() -> dict[str, Any]:
    if len(sys.argv) > 1 and sys.argv[1] not in ("-", "--stdin"):
        with open(sys.argv[1], encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def validate(plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in REQUIRED_PLAN:
        if key not in plan:
            errors.append(f"missing plan field: {key}")
    if errors:
        return errors

    nodes = plan.get("nodes") or []
    edges = plan.get("edges") or []
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return ["nodes and edges must be arrays"]

    ids: set[str] = set()
    kinds: dict[str, str] = {}
    for n in nodes:
        if not isinstance(n, dict):
            errors.append("node is not an object")
            continue
        for key in REQUIRED_NODE:
            if not str(n.get(key, "")).strip():
                errors.append(f"node {n.get('id', '?')} missing {key}")
        nid = n.get("id")
        if not nid:
            continue
        if nid in ids:
            errors.append(f"duplicate node id: {nid}")
        ids.add(nid)
        kind = n.get("kind")
        kinds[nid] = kind
        if kind not in KINDS:
            errors.append(f"node {nid}: unknown kind {kind!r}")

    for e in edges:
        if not isinstance(e, dict) or "id" not in e:
            errors.append("edge missing id")
            continue
        src, tgt = e.get("source"), e.get("target")
        if src not in ids:
            errors.append(f"edge {e['id']}: unknown source {src}")
        if tgt not in ids:
            errors.append(f"edge {e['id']}: unknown target {tgt}")

    for gid in plan.get("approvalGates") or []:
        if gid not in ids:
            errors.append(f"approval gate references unknown node: {gid}")
        elif kinds.get(gid) != "human_gate":
            errors.append(f"approval gate {gid} is not a human_gate node")

    for loop in plan.get("loops") or []:
        nid = loop.get("nodeId") if isinstance(loop, dict) else None
        if nid not in ids:
            errors.append(f"loop references unknown node: {nid}")
        until = loop.get("until") if isinstance(loop, dict) else None
        max_i = loop.get("maxIterations") if isinstance(loop, dict) else None
        if not until:
            errors.append(f"loop {nid} missing until")
        if not isinstance(max_i, int) or max_i < 1:
            errors.append(f"loop {nid} maxIterations must be a positive int")

    adj: dict[str, list[str]] = {i: [] for i in ids}
    for e in edges:
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
        for nxt in adj.get(nid, []):
            if visit(nxt):
                return True
        state[nid] = 2
        return False

    for nid in ids:
        if visit(nid):
            errors.append("plan graph contains a cycle")
            break

    return errors


def mermaid(plan: dict[str, Any]) -> str:
    lines = ["flowchart LR"]
    for n in plan.get("nodes") or []:
        if not isinstance(n, dict) or "id" not in n:
            continue
        nid = n["id"]
        label = n.get("label", nid)
        kind = n.get("kind", "")
        branch = n.get("branch", "")
        text = f"{label}<br/>{kind} · {branch}"
        shape = f'{nid}["{text}"]'
        if kind == "human_gate":
            shape = f'{nid}{{"{text}"}}'
        elif kind == "decision":
            shape = f'{nid}{{"{text}"}}'
        elif kind == "store":
            shape = f'{nid}[("{text}")]'
        lines.append(f"  {shape}")
    for e in plan.get("edges") or []:
        if not isinstance(e, dict):
            continue
        src, tgt = e.get("source"), e.get("target")
        if not src or not tgt:
            continue
        elabel = e.get("label")
        if elabel:
            lines.append(f"  {src} -->|{elabel}| {tgt}")
        else:
            lines.append(f"  {src} --> {tgt}")
    return "\n".join(lines)


def main() -> int:
    try:
        plan = load()
    except json.JSONDecodeError as exc:
        print(f"invalid JSON: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"cannot read plan: {exc}", file=sys.stderr)
        return 1

    errors = validate(plan)
    if errors:
        print("plan is not valid:")
        for err in errors:
            print(f"  - {err}")
        return 1

    n_nodes = len(plan.get("nodes") or [])
    n_gates = len(plan.get("approvalGates") or [])
    print(f"ok: {n_nodes} nodes, {n_gates} approval gate(s), DAG")
    print()
    print(mermaid(plan))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
