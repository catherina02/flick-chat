import type { ReactionSummary } from "../types";
import { toggleReaction } from "../api";

type ReactionBarProps = {
  messageId: number;
  reactions: ReactionSummary[];
  onUpdate: (reactions: ReactionSummary[]) => void;
  className?: string;
};

/** Shows existing reaction counts only (picker is separate, on long-press). */
export default function ReactionBar({ messageId, reactions, onUpdate, className = "" }: ReactionBarProps) {
  if (!reactions.length) return null;

  async function react(emoji: string) {
    try {
      const updated = await toggleReaction(messageId, emoji);
      onUpdate(updated.reactions);
    } catch {
      // ignore
    }
  }

  return (
    <div className={`reaction-bar ${className}`.trim()}>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`reaction-chip ${r.reacted ? "active" : ""}`}
          onClick={() => void react(r.emoji)}
        >
          {r.emoji} {r.count}
        </button>
      ))}
    </div>
  );
}
