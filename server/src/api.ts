import express from "express";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generatePlan } from "./planner";
import { GateDecision, Run } from "./orchestrator/run";
import { RunStore } from "./orchestrator/store";

const CreateRunBody = z.object({ prompt: z.string().min(1).max(2000) });
const InterveneBody = z.object({
  action: z.enum(["pause_branch", "resume_branch", "kill_branch", "edit_instructions", "move_gate"]),
  branch: z.string().optional(),
  nodeId: z.string().optional(),
  instructions: z.string().optional(),
  afterNodeId: z.string().optional(),
});
const GateBody = z.object({
  decisions: z.array(
    z.object({
      itemId: z.string(),
      action: z.enum(["approved", "edited", "rejected"]),
      editedContent: z.string().optional(),
    })
  ),
});

export function createApp(store: RunStore = new RunStore()): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/api/runs", (_req, res) => {
    res.json({ runs: store.list() });
  });

  app.post("/api/runs", async (req, res) => {
    const body = CreateRunBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.message });
    const id = randomUUID();
    try {
      const plan = await generatePlan(id, body.data.prompt);
      const run = new Run(plan);
      store.add(run);
      res.json({ id });
    } catch (err) {
      res.status(500).json({ error: `planner failed: ${(err as Error).message}` });
    }
  });

  app.get("/api/runs/:id", (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "run not found" });
    res.json({ id: entry.id, live: entry.run !== undefined, events: entry.events });
  });

  app.get("/api/runs/:id/events", (req, res) => {
    const entry = store.get(req.params.id);
    if (!entry) return res.status(404).json({ error: "run not found" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const lastId = Number(req.headers["last-event-id"] ?? "-1");
    const send = (ev: { seq: number }) =>
      res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
    for (const ev of entry.events) if (ev.seq > lastId) send(ev);

    if (!entry.run) {
      // history-only run: everything has been sent; close the stream cleanly
      res.end();
      return;
    }
    const unsubscribe = entry.run.subscribe(send);
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.post("/api/runs/:id/approve", (req, res) => {
    withLiveRun(store, req.params.id, res, (run) => {
      run.approve();
      res.json({ ok: true });
    });
  });

  app.post("/api/runs/:id/intervene", (req, res) => {
    const body = InterveneBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.message });
    withLiveRun(store, req.params.id, res, (run) => {
      const b = body.data;
      switch (b.action) {
        case "pause_branch":
          run.pauseBranch(required(b.branch, "branch"));
          break;
        case "resume_branch":
          run.resumeBranch(required(b.branch, "branch"));
          break;
        case "kill_branch":
          run.killBranch(required(b.branch, "branch"));
          break;
        case "edit_instructions":
          run.editInstructions(required(b.nodeId, "nodeId"), required(b.instructions, "instructions"));
          break;
        case "move_gate":
          run.moveGate(required(b.nodeId, "nodeId"), required(b.afterNodeId, "afterNodeId"));
          break;
      }
      res.json({ ok: true });
    });
  });

  app.post("/api/runs/:id/gate", (req, res) => {
    const body = GateBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.message });
    withLiveRun(store, req.params.id, res, (run) => {
      run.resolveGate(body.data.decisions as GateDecision[]);
      res.json({ ok: true });
    });
  });

  serveWebBuild(app);
  return app;
}

/** Serves the built frontend (single-port production deployment). */
function serveWebBuild(app: express.Express): void {
  const candidates = [
    process.env.WEB_DIST,
    path.resolve(process.cwd(), "web/dist"),
    path.resolve(process.cwd(), "../web/dist"),
  ].filter((p): p is string => Boolean(p));
  const dist = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
  if (!dist) return;
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|healthz).*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

function withLiveRun(
  store: RunStore,
  id: string,
  res: express.Response,
  fn: (run: Run) => void
): void {
  const entry = store.get(id);
  if (!entry) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  if (!entry.run) {
    res.status(409).json({ error: "run is no longer live" });
    return;
  }
  try {
    fn(entry.run);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
}

function required<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`${name} is required`);
  return v;
}
