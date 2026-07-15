import { AnnotationCard } from "@agent-viz/shared";

const KIND_TITLE: Record<AnnotationCard["kind"], string> = {
  amendment: "Plan changed",
  intervention: "You stepped in",
  gate: "Checkpoint",
  lifecycle: "Run",
};

export function AnnotationFeed({ annotations }: { annotations: AnnotationCard[] }) {
  if (annotations.length === 0) {
    return <div className="feed-empty">Structural changes and your interventions will appear here.</div>;
  }
  return (
    <div className="annotation-feed">
      {[...annotations].reverse().map((a) => (
        <div key={a.eventId} className={`annotation card-${a.kind}`}>
          <div className="annotation-kind">{KIND_TITLE[a.kind]}</div>
          <div className="annotation-title">{a.title}</div>
          <div className="annotation-body">{a.body}</div>
          {a.evidence && <div className="annotation-evidence">Evidence: {a.evidence}</div>}
          <div className="annotation-ts">{new Date(a.ts).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
}
