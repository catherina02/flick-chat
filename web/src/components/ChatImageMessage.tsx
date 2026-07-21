import { useState } from "react";
import type { ChatMessage } from "../types";
import { messageAttachmentUrl } from "../api";
import { formatMessageTime } from "../utils/ui";

type ChatImageMessageProps = {
  message: ChatMessage;
  receipt?: string;
  onOpen: (message: ChatMessage) => void;
};

function attachmentUrl(message: ChatMessage) {
  if (message.attachment_url?.includes("token=")) return message.attachment_url;
  return messageAttachmentUrl(message.id);
}

export default function ChatImageMessage({ message, receipt, onOpen }: ChatImageMessageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const url = attachmentUrl(message);
  const caption = message.body?.trim();

  if (failed) {
    return (
      <div className="image-bubble-fallback">
        <span>📷 Photo unavailable</span>
        <a href={url} target="_blank" rel="noreferrer" className="file-link">
          Tap to download
        </a>
      </div>
    );
  }

  return (
    <div className="image-bubble-inner">
      <button
        type="button"
        className="image-thumb"
        onClick={() => onOpen(message)}
        aria-label="View photo"
      >
        {!loaded ? <div className="image-thumb-placeholder" aria-hidden /> : null}
        <img
          src={url}
          alt={message.file_name || "Photo"}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
        <span className="image-time-overlay">
          {message.edited_at ? <span className="edited-label">edited </span> : null}
          {formatMessageTime(message.created_at)}
          {receipt ? <span className="receipt">{receipt}</span> : null}
        </span>
      </button>
      {caption ? <p className="image-caption">{caption}</p> : null}
    </div>
  );
}

export { attachmentUrl as resolveImageUrl };
