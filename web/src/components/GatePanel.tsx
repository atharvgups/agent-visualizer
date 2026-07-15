import { useState } from "react";
import { GateState } from "@agent-viz/shared";

type Decision = { action: "approved" | "edited" | "rejected"; editedContent?: string };

export function GatePanel({
  gate,
  onResolve,
}: {
  gate: GateState;
  onResolve: (
    decisions: { itemId: string; action: "approved" | "edited" | "rejected"; editedContent?: string }[]
  ) => Promise<void>;
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const decided = Object.keys(decisions).length;
  const total = gate.items.length;

  const set = (itemId: string, d: Decision) => setDecisions((prev) => ({ ...prev, [itemId]: d }));

  return (
    <div className="gate-overlay">
      <div className="gate-panel">
        <div className="gate-head">
          <div>
            <div className="gate-title">✋ Your review</div>
            <div className="gate-sub">
              Execution is paused. Approve, edit or reject each item — nothing moves until you decide.
            </div>
          </div>
          <span className="gate-progress">
            {decided}/{total} decided
          </span>
        </div>
        <div className="gate-items">
          {gate.items.map((item) => {
            const d = decisions[item.id];
            return (
              <div key={item.id} className={`gate-item ${d ? `decided-${d.action}` : ""}`}>
                <div className="gate-item-title">{item.title}</div>
                {editingId === item.id ? (
                  <div className="edit-box">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={7} />
                    <div className="row">
                      <button
                        onClick={() => {
                          set(item.id, { action: "edited", editedContent: editText });
                          setEditingId(null);
                        }}
                      >
                        Save edit
                      </button>
                      <button className="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="gate-item-content">{d?.editedContent ?? item.content}</pre>
                )}
                <div className="row">
                  <button
                    className={d?.action === "approved" ? "active" : ""}
                    onClick={() => set(item.id, { action: "approved" })}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className={d?.action === "edited" ? "active" : ""}
                    onClick={() => {
                      setEditText(d?.editedContent ?? item.content);
                      setEditingId(item.id);
                    }}
                  >
                    ✎ Edit
                  </button>
                  <button
                    className={`danger ${d?.action === "rejected" ? "active" : ""}`}
                    onClick={() => set(item.id, { action: "rejected" })}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          className="primary gate-submit"
          disabled={decided < total || submitting}
          onClick={async () => {
            setSubmitting(true);
            await onResolve(
              gate.items.map((i) => ({
                itemId: i.id,
                action: decisions[i.id].action,
                editedContent: decisions[i.id].editedContent,
              }))
            );
          }}
        >
          Submit decisions & continue
        </button>
      </div>
    </div>
  );
}
