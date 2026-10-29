#!/usr/bin/env python3
"""Replay a run event log, check amendments, and print an audit trail.

Usage:
  python3 replay_audit.py events.jsonl
  python3 replay_audit.py events.jsonl --until 10
  python3 replay_audit.py events.jsonl --check-amendments
  python3 replay_audit.py events.jsonl --export-markdown

Self-contained. Run unchanged.
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

STRUCTURAL = {
    "plan_proposed",
    "plan_approved",
    "plan_amendment",
    "gate_opened",
    "gate_resolved",
    "intervention",
    "run_finished",
}


def load_events(path: str) -> list[dict[str, Any]]:
    raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    events = [json.loads(line) for line in raw.splitlines() if line.strip()]
    events.sort(key=lambda e: e.get("seq", 0))
    return events


def apply_mutation(plan: dict[str, Any] | None, mutation: dict[str, Any]) -> dict[str, Any]:
    if not plan:
        raise ValueError("amendment has no plan to mutate")
    remove_n = set(mutation.get("removeNodeIds") or [])
    remove_e = set(mutation.get("removeEdgeIds") or [])
    nodes = [n for n in plan.get("nodes", []) if n.get("id") not in remove_n]
    nodes.extend(mutation.get("addNodes") or [])
    edges = [e for e in plan.get("edges", []) if e.get("id") not in remove_e]
    edges.extend(mutation.get("addEdges") or [])
    return {**plan, "nodes": nodes, "edges": edges}


def has_cycle(plan: dict[str, Any]) -> bool:
    ids = {n["id"] for n in plan.get("nodes", []) if "id" in n}
    adj = {i: [] for i in ids}
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
        if any(visit(n) for n in adj.get(nid, [])):
            return True
        state[nid] = 2
        return False

    return any(visit(i) for i in ids)


def check_amendments(events: list[dict[str, Any]]) -> list[str]:
    problems: list[str] = []
    plan = None
    for ev in events:
        t = ev.get("type")
        if t == "plan_proposed":
            plan = ev.get("plan")
        elif t in {"plan_amendment", "intervention"} and ev.get("mutation"):
            if t == "plan_amendment":
                for field in ("change", "reason", "evidence"):
                    if not str(ev.get(field) or "").strip():
                        problems.append(f"seq {ev.get('seq')}: amendment missing {field}")
            try:
                nxt = apply_mutation(plan, ev.get("mutation") or {})
            except ValueError as exc:
                problems.append(f"seq {ev.get('seq')}: {exc}")
                continue
            ids = {n.get("id") for n in nxt.get("nodes", [])}
            for e in nxt.get("edges", []):
                if e.get("source") not in ids or e.get("target") not in ids:
                    problems.append(f"seq {ev.get('seq')}: mutation leaves a dangling edge {e.get('id')}")
            if has_cycle(nxt):
                problems.append(f"seq {ev.get('seq')}: mutation introduces a cycle")
            plan = nxt
        elif t == "plan_amendment" and not ev.get("mutation"):
            problems.append(f"seq {ev.get('seq')}: amendment missing mutation")
    structural = [e for e in events if e.get("type") in STRUCTURAL]
    if len(structural) > 40:
        problems.append(
            f"unusually many structural events ({len(structural)}). A healthy run is about 5-15 plus gates."
        )
    return problems


def replay(events: list[dict[str, Any]]) -> dict[str, Any]:
    plan = None
    phase = "planning"
    outcome = None
    summary = None
    cards: list[str] = []
    statuses: dict[str, str] = {}
    for ev in events:
        t = ev.get("type")
        if t == "plan_proposed":
            plan = ev.get("plan")
            phase = "proposed"
            for n in (plan or {}).get("nodes", []):
                statuses[n["id"]] = "proposed"
            cards.append("Plan proposed")
        elif t == "plan_approved":
            phase = "executing"
            statuses = {k: "pending" for k in statuses}
            cards.append("Plan approved")
        elif t == "plan_amendment":
            plan = apply_mutation(plan, ev.get("mutation") or {})
            for n in (ev.get("mutation") or {}).get("addNodes") or []:
                if n.get("id"):
                    statuses[n["id"]] = "pending"
            cards.append(
                f"Amendment: {ev.get('change')} | {ev.get('reason')} | evidence: {ev.get('evidence')}"
            )
        elif t == "node_status" and ev.get("nodeId"):
            statuses[ev["nodeId"]] = ev.get("status", statuses.get(ev["nodeId"], "pending"))
        elif t == "intervention":
            if ev.get("mutation"):
                plan = apply_mutation(plan, ev["mutation"])
            cards.append(f"Intervention: {ev.get('action')}")
        elif t == "gate_opened":
            phase = "gated"
            cards.append(f"Gate opened on {ev.get('nodeId')}")
        elif t == "gate_resolved":
            phase = "executing"
            cards.append(f"Gate resolved on {ev.get('nodeId')}")
        elif t == "run_finished":
            phase = "finished"
            outcome = ev.get("outcome")
            summary = ev.get("summary")
            cards.append(f"Finished ({outcome}): {summary}")
    return {
        "phase": phase,
        "outcome": outcome,
        "summary": summary,
        "plan": plan,
        "statuses": statuses,
        "cards": cards,
        "structuralCount": sum(1 for e in events if e.get("type") in STRUCTURAL),
        "eventCount": len(events),
        "lastSeq": events[-1].get("seq") if events else None,
    }


def markdown_report(state: dict[str, Any]) -> str:
    lines = [
        "# Audit trail",
        "",
        f"- Phase: {state['phase']}",
        f"- Events folded: {state['eventCount']} (last seq {state['lastSeq']})",
        f"- Structural events: {state['structuralCount']}",
    ]
    if state.get("outcome"):
        lines.append(f"- Outcome: {state['outcome']}")
        lines.append(f"- Summary: {state.get('summary')}")
    lines += ["", "## Timeline", ""]
    for i, card in enumerate(state.get("cards") or [], 1):
        lines.append(f"{i}. {card}")
    lines += ["", "## Node statuses", ""]
    plan = state.get("plan") or {}
    statuses = state.get("statuses") or {}
    for n in plan.get("nodes", []):
        nid = n.get("id")
        lines.append(f"- {n.get('label', nid)} (`{nid}`): {statuses.get(nid, 'unknown')}")
    return "\n".join(lines) + "\n"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("events", help="JSONL event log, or - for stdin")
    p.add_argument("--until", type=int, help="Fold only events with seq <= this value")
    p.add_argument("--check-amendments", action="store_true")
    p.add_argument("--export-markdown", action="store_true")
    args = p.parse_args()
    try:
        events = load_events(args.events)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read events: {exc}", file=sys.stderr)
        return 1
    if args.until is not None:
        events = [e for e in events if e.get("seq", 0) <= args.until]

    problems: list[str] = []
    if args.check_amendments:
        problems = check_amendments(events)
        if problems:
            print("amendment check failed:")
            for item in problems:
                print(f"  - {item}")
            return 1
        print("amendment check ok")

    try:
        state = replay(events)
    except ValueError as exc:
        print(f"replay failed: {exc}", file=sys.stderr)
        return 1

    if args.export_markdown:
        sys.stdout.write(markdown_report(state))
        return 0 if not problems else 1

    if not args.check_amendments:
        json.dump(
            {
                "phase": state["phase"],
                "outcome": state["outcome"],
                "summary": state["summary"],
                "lastSeq": state["lastSeq"],
                "eventCount": state["eventCount"],
                "structuralCount": state["structuralCount"],
                "statuses": state["statuses"],
                "cards": state["cards"],
            },
            sys.stdout,
            indent=2,
        )
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
