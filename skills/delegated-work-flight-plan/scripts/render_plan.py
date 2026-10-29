#!/usr/bin/env python3
"""Render a plan-as-data JSON file as a left-to-right Mermaid flowchart.

Reads a plan object from a file path or stdin. Optional second JSON file of
node runtime ({"nodeId": {"status": "running"}}) tints nodes by status.
Stdlib only. No network.
"""

from __future__ import annotations

import json
import re
import sys

SHAPES = {
    "source": ("([", "])"),
    "transform": ("[", "]"),
    "store": ("[(", ")]"),
    "decision": ("{", "}"),
    "human_gate": ("{{", "}}"),
    "loop": ("[[", "]]"),
}

STATUS_CLASS = {
    "proposed": "proposed",
    "pending": "pending",
    "running": "running",
    "blocked": "blocked",
    "paused": "paused",
    "done": "done",
    "failed": "failed",
    "killed": "killed",
}


def load_json(path: str | None) -> object:
    if path and path != "-":
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return json.load(sys.stdin)


def mermaid_id(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", raw)
    if not cleaned or cleaned[0].isdigit():
        cleaned = "n_" + cleaned
    return cleaned


def escape_label(text: str) -> str:
    return text.replace('"', "#quot;").replace("[", "(").replace("]", ")").replace("\n", " ")


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        plan = load_json(None)
        runtime = {}
    else:
        plan = load_json(argv[0])
        runtime = load_json(argv[1]) if len(argv) > 1 else {}
    if not isinstance(plan, dict) or not isinstance(plan.get("nodes"), list):
        print("ERROR plan JSON must have a nodes array", file=sys.stderr)
        return 1
    if not isinstance(runtime, dict):
        runtime = {}

    print("```mermaid")
    print("flowchart LR")
    used = set()
    for node in plan["nodes"]:
        if not isinstance(node, dict):
            continue
        nid = mermaid_id(str(node.get("id", "node")))
        used.add(nid)
        kind = node.get("kind", "transform")
        left, right = SHAPES.get(kind, ("[", "]"))
        label = escape_label(str(node.get("label", nid)))
        print(f'  {nid}{left}"{label}"{right}')

    for edge in plan.get("edges") or []:
        if not isinstance(edge, dict):
            continue
        src = mermaid_id(str(edge.get("source", "")))
        tgt = mermaid_id(str(edge.get("target", "")))
        if src not in used or tgt not in used:
            continue
        elabel = edge.get("label")
        if elabel:
            print(f'  {src} -->|{escape_label(str(elabel))}| {tgt}')
        else:
            print(f"  {src} --> {tgt}")

    print("  classDef proposed fill:#f4f1ea,stroke:#bbb")
    print("  classDef pending fill:#eee,stroke:#999")
    print("  classDef running fill:#d7ecff,stroke:#2b6cb0")
    print("  classDef blocked fill:#fff3cd,stroke:#c9a227")
    print("  classDef paused fill:#e8e0ff,stroke:#6b46c1")
    print("  classDef done fill:#d9f7d9,stroke:#2f855a")
    print("  classDef failed fill:#ffd6d6,stroke:#c53030")
    print("  classDef killed fill:#e2e8f0,stroke:#718096")

    for node in plan["nodes"]:
        if not isinstance(node, dict):
            continue
        nid = mermaid_id(str(node.get("id", "node")))
        rt = runtime.get(node.get("id"), {})
        status = rt.get("status") if isinstance(rt, dict) else None
        cls = STATUS_CLASS.get(str(status or "proposed"), "proposed")
        print(f"  class {nid} {cls}")
    print("```")
    interp = plan.get("interpretation")
    if interp:
        print()
        print("How I understood it")
        print(str(interp).strip())
    print()
    print("Proposed plan. Nothing has run yet unless a node is tinted running, done, or failed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
