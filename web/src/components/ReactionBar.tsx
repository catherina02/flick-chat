import type { ReactionSummary } from "../types";
import { toggleReaction } from "../api";

const QUICK_EMOJIS = ["👍", "✅", "❤️", "😂", "🎉"];

type ReactionBarProps = {
  messageId: number;
  reactions: ReactionSummary[];
  onUpdate: (reactions: ReactionSummary[]) => void;
};

export default function ReactionBar({ messageId, reactions, onUpdate }: ReactionBarProps) {
  async function react(emoji: string) {
    try {
      const updated = await toggleReaction(messageId, emoji);
      onUpdate(updated.reactions);
    } catch {
      // ignore
    }
  }

  return (
    <div className="reaction-bar">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          className={`reaction-chip ${r.reacted ? "active" : ""}`}
          onClick={() => react(r.emoji)}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      <div className="reaction-quick">
        {QUICK_EMOJIS.filter((e) => !reactions.some((r) => r.emoji === e)).map((emoji) => (
          <button key={emoji} type="button" className="reaction-add" onClick={() => react(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
