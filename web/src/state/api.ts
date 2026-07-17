import { RunEvent } from "@agent-viz/shared";

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

export interface RunSnapshot {
  id: string;
  live: boolean;
  events: RunEvent[];
}

async function parseError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `request failed: ${res.status}`;
}

export async function apiPost<T = { ok: true }>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as T;
}

export function createRun(prompt: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>("/api/runs", { prompt });
}

export function listRuns(): Promise<{ runs: RunSummary[] }> {
  return apiGet<{ runs: RunSummary[] }>("/api/runs");
}

export function getRunSnapshot(id: string): Promise<RunSnapshot> {
  return apiGet<RunSnapshot>(`/api/runs/${id}`);
}
