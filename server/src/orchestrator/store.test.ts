import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { RunEvent } from "@agent-viz/shared";

process.env.SIM_SPEED = "60";

const mods = async () => {
  const { Run } = await import("./run");
  const { RunStore } = await import("./store");
  const { buildPlan } = await import("../planner/domainPlanner");
  return { Run, RunStore, buildPlan };
};

function waitForType(
  run: { events: RunEvent[]; subscribe: (fn: (ev: RunEvent) => void) => () => void },
  type: RunEvent["type"],
  timeoutMs = 20000
): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const existing = run.events.find((e) => e.type === type);
    if (existing) return resolve(existing);
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const unsub = run.subscribe((ev) => {
      if (ev.type === type) {
        clearTimeout(timer);
        unsub();
        resolve(ev);
      }
    });
  });
}

describe("RunStore", () => {
  let M: Awaited<ReturnType<typeof mods>>;

  beforeAll(async () => {
    M = await mods();
  });

  it("persists a finished run and reloads it as history", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-store-"));
    const store = new M.RunStore(dir);
    const plan = M.buildPlan("persist-1", "Summarize this PDF");
    const run = new M.Run(plan);
    store.add(run);
    run.approve();
    await waitForType(run, "run_finished");
    // wait for the write stream to flush
    await new Promise((r) => setTimeout(r, 200));

    const reloaded = new M.RunStore(dir);
    const entry = reloaded.get("persist-1");
    expect(entry).toBeDefined();
    expect(entry!.run).toBeUndefined();
    expect(entry!.events.map((e) => e.type)).toEqual(run.events.map((e) => e.type));
    const summary = reloaded.list().find((s) => s.id === "persist-1");
    expect(summary?.phase).toBe("finished");
    expect(summary?.outcome).toBe("completed");
    expect(summary?.live).toBe(false);
  });

  it("closes an interrupted run as aborted on reload", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-store-"));
    // simulate a run that died mid-execution: log has no run_finished
    const events: RunEvent[] = [
      {
        type: "plan_proposed",
        tier: "structural",
        plan: M.buildPlan("interrupted-1", "Summarize this PDF"),
        id: "e0",
        ts: 1,
        seq: 0,
      },
      { type: "plan_approved", tier: "structural", id: "e1", ts: 2, seq: 1 },
      {
        type: "node_status",
        tier: "operational",
        nodeId: "do-task",
        status: "running",
        id: "e2",
        ts: 3,
        seq: 2,
      },
    ];
    fs.writeFileSync(
      path.join(dir, "interrupted-1.jsonl"),
      events.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );

    const store = new M.RunStore(dir);
    const entry = store.get("interrupted-1")!;
    const last = entry.events[entry.events.length - 1];
    expect(last.type).toBe("run_finished");
    if (last.type === "run_finished") expect(last.outcome).toBe("aborted");
    // the aborted marker is persisted too, so the next reload agrees
    const again = new M.RunStore(dir);
    expect(again.list().find((s) => s.id === "interrupted-1")?.outcome).toBe("aborted");
  });

  it("skips corrupt trailing lines instead of dropping the run", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-store-"));
    const good = {
      type: "plan_proposed",
      tier: "structural",
      plan: M.buildPlan("torn-1", "Summarize this PDF"),
      id: "e0",
      ts: 1,
      seq: 0,
    };
    fs.writeFileSync(path.join(dir, "torn-1.jsonl"), JSON.stringify(good) + "\n{ torn wri");
    const store = new M.RunStore(dir);
    const entry = store.get("torn-1");
    expect(entry).toBeDefined();
    expect(entry!.events[0].type).toBe("plan_proposed");
  });
});
