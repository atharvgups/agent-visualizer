import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RunEvent, RunState, reduceEvents } from "@agent-viz/shared";
import { apiPost, getRunSnapshot } from "./api";

export interface RunApi {
  events: RunEvent[];
  /** State at the scrub position (or live head when not scrubbing). */
  state: RunState;
  /** Always the live head, regardless of scrubbing. */
  liveState: RunState;
  scrub: number | null;
  setScrub: (i: number | null) => void;
  approve: () => Promise<void>;
  intervene: (body: Record<string, string>) => Promise<void>;
  resolveGate: (
    decisions: { itemId: string; action: "approved" | "edited" | "rejected"; editedContent?: string }[]
  ) => Promise<void>;
  loading: boolean;
  notFound: boolean;
  /** True when the run is executing in the server process right now. */
  live: boolean;
}

export function useRun(runId: string, onError: (message: string) => void): RunApi {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [scrub, setScrub] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const addEvent = useCallback((ev: RunEvent) => {
    setEvents((prev) =>
      prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev].sort((a, b) => a.seq - b.seq)
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEvents([]);
    setScrub(null);
    setLoading(true);
    setNotFound(false);
    setLive(false);

    const openStream = () => {
      esRef.current?.close();
      const es = new EventSource(`/api/runs/${runId}/events`);
      es.onmessage = (m) => addEvent(JSON.parse(m.data) as RunEvent);
      es.onerror = () => {
        // server restarted or run finished: fall back to the snapshot
        void getRunSnapshot(runId)
          .then((snap) => {
            if (cancelled) return;
            for (const ev of snap.events) addEvent(ev);
            setLive(snap.live);
            if (!snap.live) es.close();
          })
          .catch(() => {
            /* transient network error: EventSource retries on its own */
          });
      };
      esRef.current = es;
    };

    getRunSnapshot(runId)
      .then((snap) => {
        if (cancelled) return;
        for (const ev of snap.events) addEvent(ev);
        setLive(snap.live);
        setLoading(false);
        if (snap.live) openStream();
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoading(false);
        setNotFound(true);
        onError(err.message);
      });

    return () => {
      cancelled = true;
      esRef.current?.close();
      esRef.current = null;
    };
    // note: onError (a stable toast setter) is intentionally not a dependency —
    // the stream must only re-subscribe when the run id changes
  }, [runId, addEvent]);

  const liveState = useMemo(() => reduceEvents(events), [events]);

  // once the run finishes, the stream has nothing more to say
  useEffect(() => {
    if (liveState.phase === "finished") {
      esRef.current?.close();
      esRef.current = null;
      setLive(false);
    }
  }, [liveState.phase]);

  const state = useMemo(
    () => (scrub === null ? liveState : reduceEvents(events.slice(0, scrub + 1))),
    [events, scrub, liveState]
  );

  const guard = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (err) {
        onError((err as Error).message);
      }
    },
    [onError]
  );

  const approve = useCallback(
    () => guard(() => apiPost(`/api/runs/${runId}/approve`)),
    [guard, runId]
  );
  const intervene = useCallback(
    (body: Record<string, string>) => guard(() => apiPost(`/api/runs/${runId}/intervene`, body)),
    [guard, runId]
  );
  const resolveGate = useCallback(
    (decisions: { itemId: string; action: "approved" | "edited" | "rejected"; editedContent?: string }[]) =>
      guard(() => apiPost(`/api/runs/${runId}/gate`, { decisions })),
    [guard, runId]
  );

  return {
    events,
    state,
    liveState,
    scrub,
    setScrub,
    approve,
    intervene,
    resolveGate,
    loading,
    notFound,
    live,
  };
}
