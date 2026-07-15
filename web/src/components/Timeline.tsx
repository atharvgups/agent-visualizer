import { RunEvent } from "@agent-viz/shared";

const STRUCTURAL_MARKS: Partial<Record<RunEvent["type"], string>> = {
  plan_proposed: "Plan proposed",
  plan_approved: "Approved",
  plan_amendment: "Plan amended",
  gate_opened: "Gate opened",
  gate_resolved: "Gate resolved",
  intervention: "Intervention",
  run_finished: "Finished",
};

export function Timeline({
  events,
  scrub,
  setScrub,
}: {
  events: RunEvent[];
  scrub: number | null;
  setScrub: (i: number | null) => void;
}) {
  const max = events.length - 1;
  const pos = scrub ?? max;
  return (
    <div className="timeline">
      <div className="timeline-head">
        <span className="timeline-title">History — scrub to replay how the plan became what actually ran</span>
        {scrub !== null && (
          <button className="ghost" onClick={() => setScrub(null)}>
            Jump to live
          </button>
        )}
      </div>
      <div className="timeline-track-wrap">
        <input
          type="range"
          min={0}
          max={max}
          value={pos}
          onChange={(e) => {
            const v = Number(e.target.value);
            setScrub(v >= max ? null : v);
          }}
        />
        <div className="timeline-marks">
          {events.map((ev, i) =>
            ev.tier === "structural" && STRUCTURAL_MARKS[ev.type] ? (
              <button
                key={ev.seq}
                className={`mark ${i <= pos ? "mark-past" : ""}`}
                style={{ left: `${max === 0 ? 0 : (i / max) * 100}%` }}
                title={STRUCTURAL_MARKS[ev.type]}
                onClick={() => setScrub(i >= max ? null : i)}
              />
            ) : null
          )}
        </div>
      </div>
      <div className="timeline-caption">
        Event {pos + 1} of {events.length}
        {scrub !== null ? " (replaying)" : " (live)"}
      </div>
    </div>
  );
}
