import type { ReactNode } from "react";
import { useRef } from "react";
import type { ChatMessage, Conversation, User } from "../types";
import { formatDateSeparator, formatMessageTime, isSameDay } from "../utils/ui";
import { isImageMessage } from "../api";
import ChatImageMessage from "./ChatImageMessage";
import InteractiveCard from "./InteractiveCard";
import ReactionBar from "./ReactionBar";
import ReactionPicker from "./ReactionPicker";

const LONG_PRESS_MS = 3000;

export type MessageRowProps = {
  message: ChatMessage;
  index: number;
  displayMessages: ChatMessage[];
  conversation?: Conversation;
  me?: User | null;
  activeThread: boolean;
  expectedReaders: number;
  reactionPickerId: number | null;
  onOpenReactionPicker: (messageId: number) => void;
  onCloseReactionPicker: () => void;
  onReactionsUpdate: (messageId: number, reactions: ChatMessage["reactions"]) => void;
  onMessageUpdated: (message: ChatMessage) => void;
  onOpenImage: (message: ChatMessage) => void;
  onOpenThread: (message: ChatMessage) => void;
  onContextMenu: (message: ChatMessage, x: number, y: number) => void;
  renderContent: (message: ChatMessage) => ReactNode;
};

export default function ChatMessageRow({
  message,
  index,
  displayMessages,
  conversation,
  me,
  activeThread,
  expectedReaders,
  reactionPickerId,
  onOpenReactionPicker,
  onCloseReactionPicker,
  onReactionsUpdate,
  onMessageUpdated,
  onOpenImage,
  onOpenThread,
  onContextMenu,
  renderContent,
}: MessageRowProps) {
  const pressTimer = useRef<number | null>(null);
  const isMe = message.sender.id === me?.id;
  const prev = displayMessages[index - 1];
  const next = displayMessages[index + 1];
  const showDate = !prev || !isSameDay(prev.created_at, message.created_at);
  const isGrouped =
    prev &&
    prev.sender.id === message.sender.id &&
    isSameDay(prev.created_at, message.created_at) &&
    !prev.is_deleted &&
    !message.is_deleted;
  const nextGrouped =
    next &&
    next.sender.id === message.sender.id &&
    isSameDay(next.created_at, message.created_at) &&
    !next.is_deleted &&
    !message.is_deleted;
  const isRead = isMe && message.read_by.length >= expectedReaders;
  const receipt = isMe && !message.is_deleted ? (isRead ? "✓✓" : "✓") : "";
  const showSender =
    !isMe && (conversation?.type === "group" || conversation?.type === "channel") && !isGrouped;
  const showAsImage = !message.is_deleted && isImageMessage(message);
  const showPicker = reactionPickerId === message.id && !message.is_deleted;

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPointerDown() {
    if (message.is_deleted) return;
    clearPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      onOpenReactionPicker(message.id);
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS_MS);
  }

  return (
    <div>
      {showDate ? (
        <div className="date-separator">
          <span>{formatDateSeparator(message.created_at)}</span>
        </div>
      ) : null}
      <div className={`bubble-row ${isMe ? "me" : ""} ${isGrouped ? "grouped" : ""}`}>
        <div
          className={`bubble-wrap ${showAsImage ? "image-wrap" : ""} ${showPicker ? "picker-open" : ""} ${(message.reactions?.length ?? 0) > 0 ? "has-reactions-spacer" : ""}`}
          onPointerDown={onPointerDown}
          onPointerUp={clearPress}
          onPointerLeave={clearPress}
          onPointerCancel={clearPress}
          onContextMenu={(e) => {
            if (message.is_deleted) return;
            e.preventDefault();
            onContextMenu(message, e.clientX, e.clientY);
          }}
        >
          {showSender ? <p className="sender-name">{message.sender.username}</p> : null}

          {showPicker ? (
            <div className="reaction-picker-float" onClick={(e) => e.stopPropagation()}>
              <ReactionPicker
                messageId={message.id}
                onUpdate={(reactions) => onReactionsUpdate(message.id, reactions)}
                onClose={onCloseReactionPicker}
              />
            </div>
          ) : null}

          <div
            className={`bubble ${isMe ? "me" : ""} ${isGrouped || nextGrouped ? "grouped-bubble" : ""} ${message.is_deleted ? "deleted" : ""} ${message.is_urgent ? "urgent" : ""} ${message.is_pinned ? "pinned" : ""} ${showAsImage ? "image-bubble" : ""} ${(message.reactions?.length ?? 0) > 0 ? "has-reactions" : ""}`}
          >
            {message.is_pinned ? <span className="pin-indicator" title="Pinned">📌</span> : null}
            {message.is_urgent && !showAsImage ? <span className="urgent-badge">URGENT</span> : null}
            {message.message_type === "card" ? (
              <InteractiveCard
                message={message}
                meId={me?.id}
                onUpdated={onMessageUpdated}
              />
            ) : null}
            {showAsImage ? (
              <ChatImageMessage message={message} receipt={receipt} onOpen={onOpenImage} />
            ) : (
              renderContent(message)
            )}
            {!message.is_deleted && !showAsImage ? (
              <span className="bubble-meta">
                {message.edited_at ? <span className="edited-label">edited </span> : null}
                {formatMessageTime(message.created_at)}
                {receipt ? <span className="receipt">{receipt}</span> : null}
              </span>
            ) : null}
            {isMe && !message.is_deleted ? (
              <button
                type="button"
                className="bubble-menu-btn"
                aria-label="Message options"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                  onContextMenu(message, rect.left, rect.bottom + 4);
                }}
              >
                ▾
              </button>
            ) : null}
          </div>

          {!message.is_deleted && (message.reactions?.length ?? 0) > 0 ? (
            <ReactionBar
              className={`bubble-reactions ${isMe ? "me" : ""}`}
              messageId={message.id}
              reactions={message.reactions ?? []}
              onUpdate={(reactions) => onReactionsUpdate(message.id, reactions)}
            />
          ) : null}

          {!activeThread && !message.is_deleted && message.reply_count > 0 ? (
            <button type="button" className="thread-link" onClick={() => onOpenThread(message)}>
              {message.reply_count} repl{message.reply_count === 1 ? "y" : "ies"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
