import fs from "node:fs";
import path from "node:path";
import { RunEvent, reduceEvents } from "@agent-viz/shared";
import { Run } from "./run";

/**
 * Durable run storage: every event is appended to a JSONL file per run, so
 * the audit trail survives restarts. Live runs keep their executor; runs
 * loaded from disk are history-only. A run that was still executing when the
 * server died is honestly closed with an `aborted` run_finished event on the
 * next boot — the diagram never pretends a dead run is alive.
 */

export interface RunEntry {
  id: string;
  events: RunEvent[];
  /** Present only while the run is executing in this process. */
  run?: Run;
}

export interface RunSummary {
  id: string;
  prompt: string;
  phase: string;
  outcome?: "completed" | "aborted";
  live: boolean;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
}

export class RunStore {
  private entries = new Map<string, RunEntry>();
  private streams = new Map<string, fs.WriteStream>();
  readonly dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? process.env.DATA_DIR ?? path.join(process.cwd(), "data", "runs");
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadFromDisk();
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.jsonl`);
  }

  private loadFromDisk(): void {
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith(".jsonl")) continue;
      const id = name.slice(0, -".jsonl".length);
      const lines = fs
        .readFileSync(this.file(id), "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0);
      const events: RunEvent[] = [];
      for (const line of lines) {
        try {
          events.push(RunEvent.parse(JSON.parse(line)));
        } catch {
          // skip a torn/corrupt trailing line rather than dropping the run
        }
      }
      if (events.length === 0) continue;
      if (!events.some((e) => e.type === "run_finished")) {
        const last = events[events.length - 1];
        const abort: RunEvent = {
          type: "run_finished",
          tier: "structural",
          outcome: "aborted",
          summary: "Run was interrupted by a server restart before it could finish.",
          id: `${id}-aborted`,
          ts: Date.now(),
          seq: last.seq + 1,
        };
        events.push(abort);
        fs.appendFileSync(this.file(id), JSON.stringify(abort) + "\n");
      }
      this.entries.set(id, { id, events });
    }
  }

  /** Registers a live run and persists every event it emits. */
  add(run: Run): RunEntry {
    const entry: RunEntry = { id: run.id, events: run.events, run };
    this.entries.set(run.id, entry);
    const stream = fs.createWriteStream(this.file(run.id), { flags: "a" });
    this.streams.set(run.id, stream);
    // events emitted before add() (plan_proposed) are flushed first
    for (const ev of run.events) stream.write(JSON.stringify(ev) + "\n");
    run.subscribe((ev) => {
      stream.write(JSON.stringify(ev) + "\n");
      if (ev.type === "run_finished") {
        stream.end();
        this.streams.delete(run.id);
        entry.run = undefined; // demote to history once finished
      }
    });
    return entry;
  }

  get(id: string): RunEntry | undefined {
    return this.entries.get(id);
  }

  /** Live executor for intervention endpoints; undefined once finished. */
  live(id: string): Run | undefined {
    return this.entries.get(id)?.run;
  }

  list(): RunSummary[] {
    const out: RunSummary[] = [];
    for (const entry of this.entries.values()) {
      const state = reduceEvents(entry.events);
      out.push({
        id: entry.id,
        prompt: state.plan?.prompt ?? "",
        phase: state.phase,
        outcome: state.outcome,
        live: entry.run !== undefined,
        createdAt: entry.events[0]?.ts ?? 0,
        updatedAt: entry.events[entry.events.length - 1]?.ts ?? 0,
        nodeCount: state.plan?.nodes.length ?? 0,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }
}
