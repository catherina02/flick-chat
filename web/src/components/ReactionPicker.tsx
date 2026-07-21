import { toggleReaction } from "../api";
import type { ReactionSummary } from "../types";

export const QUICK_EMOJIS = ["👍", "✅", "❤️", "😂", "🎉"];

type ReactionPickerProps = {
  messageId: number;
  onUpdate: (reactions: ReactionSummary[]) => void;
  onClose?: () => void;
  className?: string;
};

export default function ReactionPicker({
  messageId,
  onUpdate,
  onClose,
  className = "",
}: ReactionPickerProps) {
  async function react(emoji: string) {
    try {
      const updated = await toggleReaction(messageId, emoji);
      onUpdate(updated.reactions);
      onClose?.();
    } catch {
      // ignore
    }
  }

  return (
    <div className={`reaction-picker ${className}`.trim()} role="toolbar" aria-label="React to message">
      {QUICK_EMOJIS.map((emoji) => (
        <button key={emoji} type="button" className="reaction-picker-btn" onClick={() => void react(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  );
}
