import { cardAction } from "../api";
import type { ChatMessage } from "../types";
import type { ApprovalCardData, PollCardData } from "../types/enterprise";

type InteractiveCardProps = {
  message: ChatMessage;
  meId?: number;
  onUpdated: (message: ChatMessage) => void;
};

export default function InteractiveCard({ message, meId, onUpdated }: InteractiveCardProps) {
  if (message.message_type !== "card" || !message.card_type) return null;

  if (message.card_type === "poll") {
    const data = message.card_data as PollCardData;
    return (
      <div className="interactive-card poll-card">
        <strong>{data.question}</strong>
        <div className="poll-options">
          {(data.options || []).map((option) => {
            const voters = data.votes?.[option] || [];
            const voted = meId ? voters.includes(meId) : false;
            return (
              <button
                key={option}
                type="button"
                className={`poll-option ${voted ? "active" : ""}`}
                onClick={async () => {
                  const updated = await cardAction(message.id, { option });
                  onUpdated(updated);
                }}
              >
                <span>{option}</span>
                <span className="poll-count">{voters.length}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const data = message.card_data as ApprovalCardData;
  const approved = meId ? data.approvals?.includes(meId) : false;
  const rejected = meId ? data.rejections?.includes(meId) : false;

  return (
    <div className="interactive-card approval-card">
      <strong>{data.title}</strong>
      <p className="meta">Status: {data.status || "pending"}</p>
      <div className="approval-actions">
        <button
          type="button"
          className={`btn secondary ${approved ? "active" : ""}`}
          onClick={async () => {
            const updated = await cardAction(message.id, { action: "approve" });
            onUpdated(updated);
          }}
        >
          Approve ({data.approvals?.length || 0})
        </button>
        <button
          type="button"
          className={`btn secondary ${rejected ? "active" : ""}`}
          onClick={async () => {
            const updated = await cardAction(message.id, { action: "reject" });
            onUpdated(updated);
          }}
        >
          Reject ({data.rejections?.length || 0})
        </button>
      </div>
    </div>
  );
}
