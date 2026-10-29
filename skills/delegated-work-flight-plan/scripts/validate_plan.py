#!/usr/bin/env python3
"""Validate a plan-as-data JSON file against the honest-diagram contract.

Reads a plan object from a file path or stdin. Prints OK plus a short
summary, or ERROR lines and exits 1. Stdlib only. No network.
"""

from __future__ import annotations

import json
import sys

KINDS = {"source", "transform", "store", "decision", "human_gate", "loop"}
REQUIRED_NODE = ("id", "kind", "label", "summary", "instructions", "agent", "branch")
REQUIRED_EDGE = ("id", "source", "target")
REQUIRED_PLAN = ("id", "prompt", "interpretation", "nodes", "edges", "approvalGates", "loops")
EXTERNAL = (
    "send",
    "submit",
    "publish",
    "email",
    "post pr",
    "open a pr",
    "commit",
    "push",
    "deploy",
    "tweet",
    "slack",
)


def load(argv: list[str]) -> dict:
    if len(argv) >= 2 and argv[1] != "-":
        with open(argv[1], encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def errors_for(plan: object) -> list[str]:
    errs: list[str] = []
    if not isinstance(plan, dict):
        return ["plan must be a JSON object"]
    for key in REQUIRED_PLAN:
        if key not in plan:
            errs.append(f"missing field: {key}")
    if errs:
        return errs

    nodes = plan.get("nodes")
    edges = plan.get("edges")
    gates = plan.get("approvalGates")
    loops = plan.get("loops")
    if not isinstance(nodes, list) or not nodes:
        errs.append("nodes must be a non-empty array")
        return errs
    if not isinstance(edges, list):
        errs.append("edges must be an array")
        return errs
    if not isinstance(gates, list):
        errs.append("approvalGates must be an array")
    if not isinstance(loops, list):
        errs.append("loops must be an array")

    ids: set[str] = set()
    by_id: dict[str, dict] = {}
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            errs.append(f"nodes[{i}] is not an object")
            continue
        for key in REQUIRED_NODE:
            if key not in node or not isinstance(node[key], str) or not node[key].strip():
                errs.append(f"nodes[{i}] missing or empty {key}")
        nid = node.get("id")
        if isinstance(nid, str):
            if nid in ids:
                errs.append(f"duplicate node id: {nid}")
            ids.add(nid)
            by_id[nid] = node
        kind = node.get("kind")
        if kind not in KINDS:
            errs.append(f"nodes[{i}] kind must be one of {sorted(KINDS)}")
        label = node.get("label", "")
        if isinstance(label, str) and any(tok in label.lower() for tok in ("api", "html", "json", "token", "oauth")):
            if len(label.split()) <= 3:
                pass  # only a hint later
        if isinstance(label, str) and len(label) > 60:
            errs.append(f"nodes[{i}] label is too long for a map card (keep under 60 chars)")

    for i, edge in enumerate(edges):
        if not isinstance(edge, dict):
            errs.append(f"edges[{i}] is not an object")
            continue
        for key in REQUIRED_EDGE:
            if key not in edge or not isinstance(edge[key], str) or not edge[key].strip():
                errs.append(f"edges[{i}] missing or empty {key}")
        src, tgt, eid = edge.get("source"), edge.get("target"), edge.get("id")
        if isinstance(src, str) and src not in ids:
            errs.append(f"edge {eid}: unknown source {src}")
        if isinstance(tgt, str) and tgt not in ids:
            errs.append(f"edge {eid}: unknown target {tgt}")

    if isinstance(gates, list):
        for g in gates:
            node = by_id.get(g)
            if node is None:
                errs.append(f"approval gate references unknown node: {g}")
            elif node.get("kind") != "human_gate":
                errs.append(f"approval gate {g} is not a human_gate node")

    if isinstance(loops, list):
        for i, loop in enumerate(loops):
            if not isinstance(loop, dict):
                errs.append(f"loops[{i}] is not an object")
                continue
            nid = loop.get("nodeId")
            if nid not in ids:
                errs.append(f"loop references unknown node: {nid}")
            until = loop.get("until")
            if not isinstance(until, str) or not until.strip():
                errs.append(f"loops[{i}] needs a human-readable until condition")
            mx = loop.get("maxIterations")
            if not isinstance(mx, int) or mx < 1:
                errs.append(f"loops[{i}] maxIterations must be a positive integer")

    # DAG check: loops live in metadata, the graph itself must not cycle.
    adj: dict[str, list[str]] = {n: [] for n in ids}
    if isinstance(edges, list):
        for edge in edges:
            if isinstance(edge, dict) and edge.get("source") in adj and edge.get("target") in ids:
                adj[edge["source"]].append(edge["target"])
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
            errs.append("plan graph contains a cycle")
            break

    text = " ".join(
        str(plan.get("interpretation", ""))
        + " "
        + " ".join(
            f"{n.get('label','')} {n.get('instructions','')}"
            for n in nodes
            if isinstance(n, dict)
        )
    ).lower()
    has_gate = any(isinstance(n, dict) and n.get("kind") == "human_gate" for n in nodes)
    if any(tok in text for tok in EXTERNAL) and not has_gate:
        errs.append(
            "work mentions sending, submitting, publishing, or shipping, but there is no human_gate"
        )

    if len(nodes) > 16:
        errs.append(f"{len(nodes)} nodes is too many; aim for 8-12 on branchy work, 1-3 on trivial work")

    return errs


def summary(plan: dict) -> str:
    nodes = plan["nodes"]
    branches = sorted({n["branch"] for n in nodes if isinstance(n, dict) and "branch" in n})
    kinds = {}
    for n in nodes:
        if isinstance(n, dict):
            kinds[n.get("kind", "?")] = kinds.get(n.get("kind", "?"), 0) + 1
    kind_s = ", ".join(f"{k}={v}" for k, v in sorted(kinds.items()))
    return (
        f"id={plan.get('id')} nodes={len(nodes)} edges={len(plan.get('edges', []))} "
        f"branches={len(branches)} gates={len(plan.get('approvalGates', []))} "
        f"kinds: {kind_s}"
    )


def main() -> int:
    try:
        plan = load(sys.argv)
    except FileNotFoundError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"ERROR invalid JSON: {exc}", file=sys.stderr)
        return 1
    errs = errors_for(plan)
    if errs:
        for e in errs:
            print(f"ERROR {e}")
        return 1
    print("OK")
    print(summary(plan))
    print("Contract: this JSON is both the diagram and the execution graph. Do not start work until the user approves it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
