#!/usr/bin/env python3
"""Replay an append-only run log up to a sequence number or event type.

Usage:
  python replay_log.py events.json
  python replay_log.py events.json --until 12
  python replay_log.py events.json --until-type plan_amendment
  python replay_log.py events.json --export-prefix /tmp/replay-state.json

Folding a prefix of the log is the replay. Do not rewrite history.
Stdlib only. No network.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Reuse the same fold as mission control by inlining a thin copy so this
# script still runs when Agensi extracts it to a temp file on its own.

TERMINAL = {"done", "failed", "killed"}


def load_events(path: str) -> list:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and isinstance(data.get("events"), list):
        data = data["events"]
    if not isinstance(data, list):
        raise ValueError("expected a JSON array of events")
    return [e for e in data if isinstance(e, dict)]


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

    for ev in events:
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
            annotations.append({"title": "Plan approved", "seq": ev.get("seq")})
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
            annotations.append(
                {
                    "title": ev.get("change") or "Plan amended",
                    "reason": ev.get("reason"),
                    "evidence": ev.get("evidence"),
                    "seq": ev.get("seq"),
                }
            )
        elif typ == "node_status" and isinstance(ev.get("nodeId"), str):
            rt(ev["nodeId"])["status"] = ev.get("status")
        elif typ == "node_progress" and isinstance(ev.get("nodeId"), str):
            rec = rt(ev["nodeId"])
            rec["counters"].update(ev.get("counters") or {})
            if ev.get("note"):
                rec["note"] = ev["note"]
        elif typ == "node_output" and isinstance(ev.get("nodeId"), str):
            rt(ev["nodeId"])["outputSummary"] = ev.get("summary")
        elif typ == "gate_opened":
            phase = "gated"
            open_gate = {"nodeId": ev.get("nodeId"), "count": len(ev.get("items") or [])}
            annotations.append({"title": "Gate opened", "seq": ev.get("seq")})
        elif typ == "gate_resolved":
            phase = "executing"
            open_gate = None
            annotations.append({"title": "Gate resolved", "seq": ev.get("seq")})
        elif typ == "intervention":
            act = ev.get("action")
            if act == "pause_branch" and ev.get("branch") and ev["branch"] not in paused:
                paused.append(ev["branch"])
            if act == "resume_branch" and ev.get("branch") in paused:
                paused = [b for b in paused if b != ev["branch"]]
            annotations.append({"title": f"Intervention: {act}", "seq": ev.get("seq")})
        elif typ == "run_finished":
            phase = "finished"
            outcome = ev.get("outcome")
            outcome_summary = ev.get("summary")
            annotations.append({"title": "Run finished", "seq": ev.get("seq")})

    return {
        "phase": phase,
        "plan": plan,
        "runtime": runtime,
        "annotations": annotations,
        "open_gate": open_gate,
        "paused": paused,
        "outcome": outcome,
        "outcome_summary": outcome_summary,
        "replayedEvents": len(events),
        "lastSeq": events[-1].get("seq") if events else None,
        "lastType": events[-1].get("type") if events else None,
    }


def structural_marks(events: list) -> list[dict]:
    marks = []
    for ev in events:
        if ev.get("tier") == "structural" or ev.get("type") in {
            "plan_proposed",
            "plan_approved",
            "plan_amendment",
            "gate_opened",
            "gate_resolved",
            "intervention",
            "run_finished",
        }:
            marks.append({"seq": ev.get("seq"), "type": ev.get("type"), "ts": ev.get("ts")})
    return marks


def parse_args(argv: list[str]) -> tuple[str, int | None, str | None, str | None]:
    if len(argv) < 2:
        raise ValueError("usage: replay_log.py events.json [--until N] [--until-type TYPE] [--export-prefix path]")
    path = argv[1]
    until = None
    until_type = None
    export = None
    i = 2
    while i < len(argv):
        if argv[i] == "--until" and i + 1 < len(argv):
            until = int(argv[i + 1])
            i += 2
        elif argv[i] == "--until-type" and i + 1 < len(argv):
            until_type = argv[i + 1]
            i += 2
        elif argv[i] == "--export-prefix" and i + 1 < len(argv):
            export = argv[i + 1]
            i += 2
        else:
            raise ValueError(f"unknown argument: {argv[i]}")
    return path, until, until_type, export


def take_prefix(events: list, until: int | None, until_type: str | None) -> list:
    events = sorted(events, key=lambda e: (e.get("seq") is None, e.get("seq") or 0))
    if until_type:
        cut = None
        for e in events:
            if e.get("type") == until_type:
                cut = e.get("seq")
                break
        if cut is None:
            raise ValueError(f"no event of type {until_type}")
        until = cut if until is None else min(until, cut)
    if until is None:
        return events
    return [e for e in events if isinstance(e.get("seq"), int) and e["seq"] <= until]


def main() -> int:
    try:
        path, until, until_type, export = parse_args(sys.argv)
        events = load_events(path)
        prefix = take_prefix(events, until, until_type)
        state = fold(prefix)
        marks = structural_marks(events)
        print(f"REPLAY    events 0..{state['lastSeq']} ({state['replayedEvents']} of {len(events)})")
        print(f"AT        seq={state['lastSeq']} type={state['lastType']} phase={state['phase']}")
        if state["outcome"]:
            print(f"OUTCOME   {state['outcome']} {state['outcome_summary'] or ''}".rstrip())
        if state["paused"]:
            print("PAUSED    " + ", ".join(state["paused"]))
        if state["open_gate"]:
            print(f"GATE      {state['open_gate']}")
        print()
        print("STRUCTURAL MARKS ON THE FULL LOG")
        for m in marks:
            flag = "<" if isinstance(state["lastSeq"], int) and isinstance(m.get("seq"), int) and m["seq"] <= state["lastSeq"] else " "
            print(f"  {flag} seq={m['seq']:<4} {m['type']}")
        print()
        plan = state["plan"]
        if isinstance(plan, dict):
            print("NODES AT THIS POINT")
            for node in plan.get("nodes") or []:
                if not isinstance(node, dict):
                    continue
                rec = state["runtime"].get(node.get("id"), {})
                print(f"  [{rec.get('status','?'):<8}] {node.get('label')} ({node.get('id')})")
        print()
        print("Do not rewrite the log. Export it as-is if the user wants a file.")
        if export:
            out = Path(export)
            out.write_text(json.dumps(state, indent=2), encoding="utf-8")
            print(f"Wrote folded state to {out}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
