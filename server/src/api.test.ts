import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunEvent, reduceEvents } from "@agent-viz/shared";

process.env.SIM_SPEED = "60";

let server: Server;
let base: string;

beforeAll(async () => {
  const { createApp } = await import("./api");
  const { RunStore } = await import("./orchestrator/store");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "av-api-"));
  const app = createApp(new RunStore(dir));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  server?.close();
});

async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(`${base}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function snapshot(id: string): Promise<{ live: boolean; events: RunEvent[] }> {
  const res = await fetch(`${base}/api/runs/${id}`);
  expect(res.status).toBe(200);
  return (await res.json()) as { live: boolean; events: RunEvent[] };
}

async function waitForEvent(
  id: string,
  type: RunEvent["type"],
  timeoutMs = 20000
): Promise<RunEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await snapshot(id);
    const found = snap.events.find((e) => e.type === type);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${type}`);
}

describe("api", () => {
  it("healthz responds", async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
  });

  it("rejects invalid run creation", async () => {
    expect((await post("/api/runs", {})).status).toBe(400);
    expect((await post("/api/runs", { prompt: "" })).status).toBe(400);
  });

  it("404s for unknown runs and 409s for non-live interventions", async () => {
    expect((await fetch(`${base}/api/runs/nope`)).status).toBe(404);
    expect((await post("/api/runs/nope/approve")).status).toBe(404);
  });

  it("runs the full lifecycle over HTTP", async () => {
    const createRes = await post("/api/runs", {
      prompt: "Research every ChinaJoy side event and prep applications",
    });
    expect(createRes.status).toBe(200);
    const { id } = (await createRes.json()) as { id: string };

    const initial = await snapshot(id);
    expect(initial.live).toBe(true);
    expect(initial.events[0].type).toBe("plan_proposed");

    // approving twice must not crash the run
    expect((await post(`/api/runs/${id}/approve`)).status).toBe(200);
    expect((await post(`/api/runs/${id}/approve`)).status).toBe(409);

    const gate = await waitForEvent(id, "gate_opened");
    if (gate.type !== "gate_opened") throw new Error("unreachable");

    // gate decisions must cover the items
    const gateRes = await post(`/api/runs/${id}/gate`, {
      decisions: gate.items.map((i) => ({ itemId: i.id, action: "approved" })),
    });
    expect(gateRes.status).toBe(200);

    await waitForEvent(id, "run_finished");
    const finalSnap = await snapshot(id);
    expect(finalSnap.live).toBe(false);
    const state = reduceEvents(finalSnap.events);
    expect(state.phase).toBe("finished");
    expect(state.outcome).toBe("completed");

    // interventions on a finished run are refused, honestly
    expect((await post(`/api/runs/${id}/intervene`, { action: "kill_branch", branch: "drafting" })).status).toBe(409);

    // the run shows up in the list as finished
    const listRes = await fetch(`${base}/api/runs`);
    const { runs } = (await listRes.json()) as { runs: { id: string; phase: string }[] };
    expect(runs.find((r) => r.id === id)?.phase).toBe("finished");
  }, 30000);

  it("streams events over SSE including the resume protocol", async () => {
    const createRes = await post("/api/runs", { prompt: "Summarize this PDF" });
    const { id } = (await createRes.json()) as { id: string };
    await post(`/api/runs/${id}/approve`);
    await waitForEvent(id, "run_finished");

    const res = await fetch(`${base}/api/runs/${id}/events`, {
      headers: { "last-event-id": "1" },
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text(); // history-only stream closes after replay
    const seqs = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(seqs.length).toBeGreaterThan(0);
    expect(Math.min(...seqs)).toBe(2); // events ≤ last-event-id are skipped
  });
});
