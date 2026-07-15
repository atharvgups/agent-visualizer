import { useCallback, useMemo, useRef, useState } from "react";
import { RunEvent, RunState, reduceEvents } from "@agent-viz/shared";

export interface RunApi {
  runId: string | null;
  events: RunEvent[];
  /** State at the scrub position (or live head when not scrubbing). */
  state: RunState;
  /** Always the live head, regardless of scrubbing. */
  liveState: RunState;
  scrub: number | null;
  setScrub: (i: number | null) => void;
  start: (prompt: string) => Promise<void>;
  approve: () => Promise<void>;
  intervene: (body: Record<string, string>) => Promise<void>;
  resolveGate: (
    decisions: { itemId: string; action: "approved" | "edited" | "rejected"; editedContent?: string }[]
  ) => Promise<void>;
  planning: boolean;
}

async function post(url: string, body?: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `request failed: ${res.status}`);
  }
}

export function useRun(): RunApi {
  const [runId, setRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const start = useCallback(async (prompt: string) => {
    setPlanning(true);
    setEvents([]);
    setScrub(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`planner failed: ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      setRunId(id);
      esRef.current?.close();
      const es = new EventSource(`/api/runs/${id}/events`);
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data) as RunEvent;
        setEvents((prev) =>
          prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev].sort((a, b) => a.seq - b.seq)
        );
      };
      esRef.current = es;
    } finally {
      setPlanning(false);
    }
  }, []);

  const approve = useCallback(async () => {
    if (runId) await post(`/api/runs/${runId}/approve`);
  }, [runId]);

  const intervene = useCallback(
    async (body: Record<string, string>) => {
      if (runId) await post(`/api/runs/${runId}/intervene`, body);
    },
    [runId]
  );

  const resolveGate = useCallback(
    async (decisions: { itemId: string; action: "approved" | "edited" | "rejected"; editedContent?: string }[]) => {
      if (runId) await post(`/api/runs/${runId}/gate`, { decisions });
    },
    [runId]
  );

  const liveState = useMemo(() => reduceEvents(events), [events]);
  const state = useMemo(
    () => (scrub === null ? liveState : reduceEvents(events.slice(0, scrub + 1))),
    [events, scrub, liveState]
  );

  return { runId, events, state, liveState, scrub, setScrub, start, approve, intervene, resolveGate, planning };
}
