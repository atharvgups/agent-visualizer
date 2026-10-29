#!/usr/bin/env python3
"""Fold a JSONL run event log into a mission-control status board.

Usage:
  python3 reduce_events.py events.jsonl
  python3 reduce_events.py events.jsonl --seq 12
  python3 reduce_events.py events.jsonl --json

Self-contained. Run unchanged. Reads stdin if the path is '-' .
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def load_events(path: str) -> list[dict[str, Any]]:
    raw = sys.stdin.read() if path == "-" else open(path, encoding="utf-8").read()
    events: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        events.append(json.loads(line))
    events.sort(key=lambda e: e.get("seq", 0))
    return events


def apply_mutation(plan: dict[str, Any], mutation: dict[str, Any]) -> dict[str, Any]:
    remove_n = set(mutation.get("removeNodeIds") or [])
    remove_e = set(mutation.get("removeEdgeIds") or [])
    nodes = [n for n in plan.get("nodes", []) if n.get("id") not in remove_n]
    nodes.extend(mutation.get("addNodes") or [])
    edges = [e for e in plan.get("edges", []) if e.get("id") not in remove_e]
    edges.extend(mutation.get("addEdges") or [])
    return {**plan, "nodes": nodes, "edges": edges}


def initial_state() -> dict[str, Any]:
    return {
        "phase": "planning",
        "plan": None,
        "nodeRuntime": {},
        "annotations": [],
        "openGate": None,
        "pausedBranches": [],
        "outcome": None,
        "outcomeSummary": None,
        "liveHint": "unknown",
    }


def card(
    ev: dict[str, Any], title: str, body: str, kind: str, evidence: str | None = None, node_id: str | None = None
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "eventId": ev.get("id"),
        "ts": ev.get("ts"),
        "title": title,
        "body": body,
        "kind": kind,
    }
    if evidence:
        out["evidence"] = evidence
    if node_id:
        out["nodeId"] = node_id
    return out


def reduce_event(state: dict[str, Any], ev: dict[str, Any]) -> dict[str, Any]:
    t = ev.get("type")
    runtime = state["nodeRuntime"]

    if t == "plan_proposed":
        plan = ev.get("plan") or {}
        node_runtime = {n["id"]: {"status": "proposed", "counters": {}} for n in plan.get("nodes", []) if "id" in n}
        return {**state, "phase": "proposed", "plan": plan, "nodeRuntime": node_runtime}

    if t == "plan_approved":
        node_runtime = {k: {**v, "status": "pending"} for k, v in runtime.items()}
        return {
            **state,
            "phase": "executing",
            "nodeRuntime": node_runtime,
            "annotations": state["annotations"]
            + [card(ev, "Plan approved", "Execution started.", "lifecycle")],
        }

    if t == "plan_amendment":
        if not state["plan"]:
            return state
        plan = apply_mutation(state["plan"], ev.get("mutation") or {})
        node_runtime = dict(runtime)
        for n in (ev.get("mutation") or {}).get("addNodes") or []:
            if n.get("id"):
                node_runtime[n["id"]] = {"status": "pending", "counters": {}}
        first_new = ((ev.get("mutation") or {}).get("addNodes") or [{}])[0].get("id")
        return {
            **state,
            "plan": plan,
            "nodeRuntime": node_runtime,
            "annotations": state["annotations"]
            + [
                card(
                    ev,
                    ev.get("change") or "Plan changed",
                    ev.get("reason") or "",
                    "amendment",
                    evidence=ev.get("evidence"),
                    node_id=first_new,
                )
            ],
        }

    if t == "node_status":
        nid = ev.get("nodeId")
        if not nid:
            return state
        prev = runtime.get(nid) or {"status": "proposed", "counters": {}}
        return {
            **state,
            "nodeRuntime": {**runtime, nid: {**prev, "status": ev.get("status", prev.get("status"))}},
        }

    if t == "node_progress":
        nid = ev.get("nodeId")
        if not nid:
            return state
        prev = runtime.get(nid) or {"status": "running", "counters": {}}
        counters = {**prev.get("counters", {}), **(ev.get("counters") or {})}
        next_rt = {**prev, "counters": counters}
        if ev.get("note"):
            next_rt["note"] = ev["note"]
        return {**state, "nodeRuntime": {**runtime, nid: next_rt}}

    if t == "node_output":
        nid = ev.get("nodeId")
        if not nid:
            return state
        prev = runtime.get(nid) or {"status": "done", "counters": {}}
        return {
            **state,
            "nodeRuntime": {
                **runtime,
                nid: {**prev, "outputSummary": ev.get("summary"), "outputRaw": ev.get("raw")},
            },
        }

    if t == "gate_opened":
        items = ev.get("items") or []
        return {
            **state,
            "phase": "gated",
            "openGate": {"nodeId": ev.get("nodeId"), "items": items},
            "annotations": state["annotations"]
            + [
                card(
                    ev,
                    "Waiting for your review",
                    f"{len(items)} item(s) need a decision.",
                    "gate",
                    node_id=ev.get("nodeId"),
                )
            ],
        }

    if t == "gate_resolved":
        nid = ev.get("nodeId")
        prev = runtime.get(nid) or {"status": "blocked", "counters": {}}
        decisions = ev.get("decisions") or []
        approved = sum(1 for d in decisions if d.get("action") != "rejected")
        note = ev.get("preferenceNote")
        body = f"{approved}/{len(decisions)} items approved"
        if note:
            body += ". Preference noted."
        next_rt = {**prev}
        if note:
            next_rt["preferenceNote"] = note
        return {
            **state,
            "phase": "executing",
            "openGate": None,
            "nodeRuntime": {**runtime, nid: next_rt} if nid else runtime,
            "annotations": state["annotations"]
            + [card(ev, "Human review complete", body, "gate", node_id=nid)],
        }

    if t == "intervention":
        next_state = dict(state)
        if ev.get("mutation") and state["plan"]:
            next_state["plan"] = apply_mutation(state["plan"], ev["mutation"])
        if ev.get("action") == "edit_instructions" and ev.get("nodeId") and ev.get("instructions") and next_state.get("plan"):
            plan = dict(next_state["plan"])
            plan["nodes"] = [
                {**n, "instructions": ev["instructions"]} if n.get("id") == ev["nodeId"] else n
                for n in plan.get("nodes", [])
            ]
            next_state["plan"] = plan
        paused = list(next_state.get("pausedBranches") or [])
        if ev.get("action") == "pause_branch" and ev.get("branch"):
            if ev["branch"] not in paused:
                paused.append(ev["branch"])
        elif ev.get("action") == "resume_branch" and ev.get("branch"):
            paused = [b for b in paused if b != ev["branch"]]
        next_state["pausedBranches"] = paused
        titles = {
            "approve_plan": "Plan approved by user",
            "pause_branch": f"Branch paused: {ev.get('branch')}",
            "resume_branch": f"Branch resumed: {ev.get('branch')}",
            "kill_branch": f"Branch killed: {ev.get('branch')}",
            "edit_instructions": "Node instructions edited",
            "move_gate": "Review gate moved",
        }
        body = (
            f"New instructions: {ev.get('instructions')}"
            if ev.get("action") == "edit_instructions"
            else "Applied by the user mid-run."
        )
        next_state["annotations"] = next_state["annotations"] + [
            card(ev, titles.get(ev.get("action"), ev.get("action") or "Intervention"), body, "intervention", node_id=ev.get("nodeId"))
        ]
        return next_state

    if t == "run_finished":
        return {
            **state,
            "phase": "finished",
            "outcome": ev.get("outcome"),
            "outcomeSummary": ev.get("summary"),
            "liveHint": "false",
            "annotations": state["annotations"]
            + [card(ev, "Run finished", ev.get("summary") or "", "lifecycle")],
        }

    return state


def reduce_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    state = initial_state()
    for ev in events:
        state = reduce_event(state, ev)
    if state["phase"] == "finished":
        state["liveHint"] = "false"
    elif state["phase"] in {"executing", "gated", "proposed"}:
        state["liveHint"] = "true unless the worker process is gone"
    return state


def mermaid(state: dict[str, Any]) -> str:
    plan = state.get("plan") or {}
    runtime = state.get("nodeRuntime") or {}
    lines = ["flowchart LR"]
    for n in plan.get("nodes", []):
        nid = n.get("id")
        if not nid:
            continue
        st = (runtime.get(nid) or {}).get("status", "proposed")
        counters = (runtime.get(nid) or {}).get("counters") or {}
        extra = ""
        if counters:
            extra = "<br/>" + ", ".join(f"{k} {v}" for k, v in counters.items())
        text = f"{n.get('label', nid)}<br/>{st}{extra}"
        lines.append(f'  {nid}["{text}"]')
    for e in plan.get("edges", []):
        src, tgt = e.get("source"), e.get("target")
        if src and tgt:
            lines.append(f"  {src} --> {tgt}")
    return "\n".join(lines)


def render_text(state: dict[str, Any]) -> str:
    plan = state.get("plan") or {}
    runtime = state.get("nodeRuntime") or {}
    live = state.get("liveHint")
    phase = state.get("phase")
    lines = [f"phase: {phase} · live: {live}"]
    if state.get("outcome"):
        lines.append(f"outcome: {state['outcome']} · {state.get('outcomeSummary')}")
    paused = state.get("pausedBranches") or []
    if paused:
        lines.append("paused branches: " + ", ".join(paused))
    if state.get("openGate"):
        items = state["openGate"].get("items") or []
        lines.append(f"open gate: {state['openGate'].get('nodeId')} ({len(items)} item(s))")

    by_branch: dict[str, list[str]] = {}
    for n in plan.get("nodes", []):
        nid = n.get("id")
        rt = runtime.get(nid) or {}
        status = rt.get("status", "?")
        counters = rt.get("counters") or {}
        ctxt = ""
        if counters:
            ctxt = " (" + ", ".join(f"{k} {v}" for k, v in counters.items()) + ")"
        by_branch.setdefault(n.get("branch") or "ungrouped", []).append(
            f"  {n.get('label', nid)} [{status}]{ctxt}"
        )
    for branch, rows in by_branch.items():
        lines.append(f"branch {branch}:")
        lines.extend(rows)

    anns = list(reversed(state.get("annotations") or []))
    if anns:
        lines.append("annotations (newest first):")
        for a in anns[:12]:
            extra = f" | evidence: {a['evidence']}" if a.get("evidence") else ""
            lines.append(f"  [{a.get('kind')}] {a.get('title')}: {a.get('body')}{extra}")

    lines.append("")
    lines.append(mermaid(state))
    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("events", help="JSONL event log, or - for stdin")
    p.add_argument("--seq", type=int, help="Fold only events with seq <= this value")
    p.add_argument("--json", action="store_true", help="Print folded state as JSON")
    args = p.parse_args()
    try:
        events = load_events(args.events)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read events: {exc}", file=sys.stderr)
        return 1
    if args.seq is not None:
        events = [e for e in events if e.get("seq", 0) <= args.seq]
    state = reduce_events(events)
    if args.json:
        json.dump(state, sys.stdout, indent=2)
        sys.stdout.write("\n")
    else:
        print(render_text(state))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
