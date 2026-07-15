import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generatePlan } from "./planner";
import { GateDecision, Run } from "./orchestrator/run";

const runs = new Map<string, Run>();

const CreateRunBody = z.object({ prompt: z.string().min(1) });
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

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/api/runs", async (req, res) => {
    const body = CreateRunBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.message });
    const id = randomUUID();
    const plan = await generatePlan(id, body.data.prompt);
    const run = new Run(plan);
    runs.set(id, run);
    res.json({ id });
  });

  app.get("/api/runs/:id", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) return res.status(404).json({ error: "run not found" });
    res.json({ id: run.id, events: run.events });
  });

  app.get("/api/runs/:id/events", (req, res) => {
    const run = runs.get(req.params.id);
    if (!run) return res.status(404).json({ error: "run not found" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    for (const ev of run.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    const unsubscribe = run.subscribe((ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`));
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  app.post("/api/runs/:id/approve", (req, res) => {
    withRun(req.params.id, res, (run) => {
      run.approve();
      res.json({ ok: true });
    });
  });

  app.post("/api/runs/:id/intervene", (req, res) => {
    const body = InterveneBody.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.message });
    withRun(req.params.id, res, (run) => {
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
    withRun(req.params.id, res, (run) => {
      run.resolveGate(body.data.decisions as GateDecision[]);
      res.json({ ok: true });
    });
  });

  return app;
}

function withRun(id: string, res: express.Response, fn: (run: Run) => void): void {
  const run = runs.get(id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  try {
    fn(run);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
}

function required<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new Error(`${name} is required`);
  return v;
}
