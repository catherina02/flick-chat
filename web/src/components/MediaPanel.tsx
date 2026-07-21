import { useState } from "react";
import type { ChatMessage } from "../types";
import { isImageMessage, messageAttachmentUrl } from "../api";
import ImageViewer, { type ImageViewerItem } from "./ImageViewer";
import { formatMessageTime } from "../utils/ui";

type MediaPanelProps = {
  open: boolean;
  onClose: () => void;
  items: ChatMessage[];
  loading: boolean;
};

export default function MediaPanel({ open, onClose, items, loading }: MediaPanelProps) {
  const [viewer, setViewer] = useState<ImageViewerItem | null>(null);

  if (!open) return null;

  const photos = items.filter((m) => isImageMessage(m));
  const docs = items.filter((m) => m.message_type === "file" && !isImageMessage(m));

  function openPhoto(item: ChatMessage) {
    setViewer({
      messageId: item.id,
      url: messageAttachmentUrl(item.id),
      fileName: item.file_name || "photo.jpg",
      senderName: item.sender.username,
      createdAt: formatMessageTime(item.created_at),
    });
  }

  return (
    <>
      <div className="media-panel-overlay" onClick={onClose}>
        <div className="media-panel" onClick={(e) => e.stopPropagation()}>
          <div className="media-panel-header">
            <h3>Media, links & docs</h3>
            <button className="btn icon-btn ghost" type="button" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>

          {loading ? (
            <div className="media-panel-loading">
              <div className="spinner" />
            </div>
          ) : items.length === 0 ? (
            <p className="media-panel-empty">No media shared in this chat yet.</p>
          ) : (
            <>
              {photos.length > 0 ? (
                <section className="media-section">
                  <h4>Photos ({photos.length})</h4>
                  <div className="media-grid">
                    {photos.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="media-grid-item"
                        onClick={() => openPhoto(item)}
                      >
                        <img src={messageAttachmentUrl(item.id)} alt={item.file_name || "Photo"} loading="lazy" />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {docs.length > 0 ? (
                <section className="media-section">
                  <h4>Documents ({docs.length})</h4>
                  <div className="media-doc-list">
                    {docs.map((item) => (
                      <a
                        key={item.id}
                        href={messageAttachmentUrl(item.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="media-doc-item"
                      >
                        <span className="media-doc-icon">📄</span>
                        <span className="media-doc-name">{item.file_name || "Document"}</span>
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      <ImageViewer item={viewer} onClose={() => setViewer(null)} />
    </>
  );
}
