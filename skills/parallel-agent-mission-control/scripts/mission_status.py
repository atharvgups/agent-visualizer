#!/usr/bin/env python3
"""Fold a run event log into a mission-control status board.

Reads a JSON array of events (file path or stdin). Prints a text board:
phase, per-branch node status and counters, open gate, paused branches,
and structural annotation cards. Stdlib only. No network.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict


TERMINAL = {"done", "failed", "killed"}


def load(argv: list[str]) -> list:
    if len(argv) >= 2 and argv[1] != "-":
        with open(argv[1], encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)
    if isinstance(data, dict) and isinstance(data.get("events"), list):
        data = data["events"]
    if not isinstance(data, list):
        raise ValueError("expected a JSON array of events")
    return data


def fold(events: list) -> dict:
    phase = "planning"
    plan = None
    runtime: dict[str, dict] = {}
    annotations: list[dict] = []
    open_gate = None
    paused: list[str] = []
    outcome = None
    outcome_summary = None

    def rt(nid: str) -> dict:
        return runtime.setdefault(nid, {"status": "proposed", "counters": {}})

    def card(ev: dict, title: str, body: str, kind: str, extra: dict | None = None) -> None:
        item = {
            "title": title,
            "body": body,
            "kind": kind,
            "seq": ev.get("seq"),
            "ts": ev.get("ts"),
        }
        if extra:
            item.update(extra)
        annotations.append(item)

    for ev in events:
        if not isinstance(ev, dict):
            continue
        typ = ev.get("type")
        if typ == "plan_proposed":
            plan = ev.get("plan")
            runtime = {}
            if isinstance(plan, dict):
                for n in plan.get("nodes") or []:
                    if isinstance(n, dict) and "id" in n:
                        runtime[n["id"]] = {"status": "proposed", "counters": {}}
            phase = "proposed"
        elif typ == "plan_approved":
            for nid in list(runtime):
                runtime[nid] = {**runtime[nid], "status": "pending"}
            phase = "executing"
            card(ev, "Plan approved", "Execution started.", "lifecycle")
        elif typ == "plan_amendment":
            mut = ev.get("mutation") or {}
            if isinstance(plan, dict):
                remove = set(mut.get("removeNodeIds") or [])
                nodes = [n for n in plan.get("nodes") or [] if n.get("id") not in remove]
                nodes.extend(mut.get("addNodes") or [])
                reids = set(mut.get("removeEdgeIds") or [])
                edges = [e for e in plan.get("edges") or [] if e.get("id") not in reids]
                edges.extend(mut.get("addEdges") or [])
                plan = {**plan, "nodes": nodes, "edges": edges}
            for n in mut.get("addNodes") or []:
                if isinstance(n, dict) and "id" in n:
                    runtime[n["id"]] = {"status": "pending", "counters": {}}
            card(
                ev,
                str(ev.get("change") or "Plan amended"),
                str(ev.get("reason") or ""),
                "amendment",
                {"evidence": ev.get("evidence")},
            )
        elif typ == "node_status":
            nid = ev.get("nodeId")
            if isinstance(nid, str):
                rt(nid)["status"] = ev.get("status")
        elif typ == "node_progress":
            nid = ev.get("nodeId")
            if isinstance(nid, str):
                rec = rt(nid)
                rec["counters"].update(ev.get("counters") or {})
                if ev.get("note"):
                    rec["note"] = ev["note"]
        elif typ == "node_output":
            nid = ev.get("nodeId")
            if isinstance(nid, str):
                rec = rt(nid)
                rec["outputSummary"] = ev.get("summary")
        elif typ == "gate_opened":
            phase = "gated"
            open_gate = {"nodeId": ev.get("nodeId"), "items": ev.get("items") or []}
            n_items = len(open_gate["items"]) if isinstance(open_gate["items"], list) else 0
            card(ev, "Waiting for your review", f"{n_items} item(s) need a decision.", "gate")
        elif typ == "gate_resolved":
            phase = "executing"
            open_gate = None
            decisions = ev.get("decisions") or []
            kept = sum(1 for d in decisions if isinstance(d, dict) and d.get("action") != "rejected")
            card(ev, "Human review complete", f"{kept}/{len(decisions)} items approved.", "gate")
            nid = ev.get("nodeId")
            if isinstance(nid, str) and ev.get("preferenceNote"):
                rt(nid)["preferenceNote"] = ev["preferenceNote"]
        elif typ == "intervention":
            act = ev.get("action")
            titles = {
                "approve_plan": "Plan approved by user",
                "pause_branch": f"Branch paused: {ev.get('branch')}",
                "resume_branch": f"Branch resumed: {ev.get('branch')}",
                "kill_branch": f"Branch killed: {ev.get('branch')}",
                "edit_instructions": "Node instructions edited",
                "move_gate": "Review gate moved",
            }
            if act == "pause_branch" and ev.get("branch"):
                if ev["branch"] not in paused:
                    paused.append(ev["branch"])
            if act == "resume_branch" and ev.get("branch") in paused:
                paused = [b for b in paused if b != ev["branch"]]
            card(ev, titles.get(act, str(act)), "Applied by the user mid-run.", "intervention")
        elif typ == "run_finished":
            phase = "finished"
            outcome = ev.get("outcome")
            outcome_summary = ev.get("summary")
            card(ev, "Run finished", str(outcome_summary or outcome), "lifecycle")

    return {
        "phase": phase,
        "plan": plan,
        "runtime": runtime,
        "annotations": annotations,
        "open_gate": open_gate,
        "paused": paused,
        "outcome": outcome,
        "outcome_summary": outcome_summary,
    }


def fmt_counters(counters: dict) -> str:
    if not counters:
        return ""
    return "  " + " ".join(f"{k}={v}" for k, v in counters.items())


def render(state: dict) -> str:
    lines: list[str] = []
    live = state["phase"] not in {"finished", "planning"}
    lines.append(f"PHASE     {state['phase']}")
    if state["outcome"]:
        lines.append(f"OUTCOME   {state['outcome']}")
        if state["outcome_summary"]:
            lines.append(f"          {state['outcome_summary']}")
    elif live:
        lines.append("OUTCOME   live")
    if state["paused"]:
        lines.append("PAUSED    " + ", ".join(state["paused"]))
    gate = state["open_gate"]
    if gate:
        n = len(gate.get("items") or [])
        lines.append(f"GATE      {gate.get('nodeId')} ({n} item(s) waiting)")
    lines.append("")

    plan = state["plan"]
    if not isinstance(plan, dict):
        lines.append("No plan yet.")
        return "\n".join(lines)

    by_branch: dict[str, list] = defaultdict(list)
    for node in plan.get("nodes") or []:
        if isinstance(node, dict):
            by_branch[str(node.get("branch") or "default")].append(node)

    runtime = state["runtime"]
    for branch, nodes in by_branch.items():
        lines.append(f"BRANCH {branch}")
        for node in nodes:
            nid = node.get("id")
            rec = runtime.get(nid, {"status": "proposed", "counters": {}})
            status = str(rec.get("status") or "proposed")
            note = rec.get("note") or rec.get("outputSummary") or ""
            extra = fmt_counters(rec.get("counters") or {})
            if note:
                extra = f"{extra}  {note}".rstrip()
            label = node.get("label") or nid
            lines.append(f"  [{status:<8}] {label}{extra}")
        lines.append("")

    total = len(plan.get("nodes") or [])
    done = sum(1 for r in runtime.values() if r.get("status") in TERMINAL)
    running = sum(1 for r in runtime.values() if r.get("status") == "running")
    lines.append(f"PROGRESS  {done}/{total} terminal, {running} running")
    lines.append("")
    lines.append("ANNOTATIONS (structural only)")
    cards = list(reversed(state["annotations"]))
    if not cards:
        lines.append("  (none yet)")
    for card in cards[:12]:
        evd = card.get("evidence")
        tail = f" | evidence: {evd}" if evd else ""
        lines.append(f"  - {card['title']}: {card['body']}{tail}")
    return "\n".join(lines)


def main() -> int:
    try:
        events = load(sys.argv)
        events = sorted(
            (e for e in events if isinstance(e, dict)),
            key=lambda e: (e.get("seq") is None, e.get("seq") or 0),
        )
        print(render(fold(events)))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
