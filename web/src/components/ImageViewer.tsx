import { useCallback, useEffect, useState } from "react";
import { downloadMessageAttachment } from "../api";
import type { ReactionSummary } from "../types";
import { IconBack } from "./Icons";
import ReactionPicker from "./ReactionPicker";
import ReactionBar from "./ReactionBar";

export type ImageViewerItem = {
  messageId: number;
  url: string;
  fileName: string;
  senderName?: string;
  createdAt?: string;
  reactions?: ReactionSummary[];
};

type ImageViewerProps = {
  item: ImageViewerItem | null;
  onClose: () => void;
  onReactionsUpdate?: (messageId: number, reactions: ReactionSummary[]) => void;
};

export default function ImageViewer({ item, onClose, onReactionsUpdate }: ImageViewerProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scale, setScale] = useState(1);
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);

  useEffect(() => {
    if (!item) return;
    setSaved(false);
    setScale(1);
    setReactions(item.reactions ?? []);
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  const save = useCallback(async () => {
    if (!item || saving) return;
    setSaving(true);
    try {
      await downloadMessageAttachment(item.messageId, item.fileName);
      setSaved(true);
    } catch {
      alert("Could not save image. Try again.");
    } finally {
      setSaving(false);
    }
  }, [item, saving]);

  function handleReactionsUpdate(next: ReactionSummary[]) {
    setReactions(next);
    if (item) onReactionsUpdate?.(item.messageId, next);
  }

  if (!item) return null;

  return (
    <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <div className="image-viewer-backdrop" onClick={onClose} />

      <header className="image-viewer-header">
        <button type="button" className="btn icon-btn ghost viewer-btn" onClick={onClose} aria-label="Close">
          <IconBack />
        </button>
        <div className="image-viewer-title">
          {item.senderName ? <strong>{item.senderName}</strong> : null}
          {item.createdAt ? <span>{item.createdAt}</span> : null}
        </div>
        <button type="button" className="viewer-save-btn" onClick={save} disabled={saving}>
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div
        className="image-viewer-body"
        onClick={onClose}
        onDoubleClick={() => setScale((s) => (s === 1 ? 2 : 1))}
      >
        <img
          src={item.url}
          alt={item.fileName || "Photo"}
          className="image-viewer-photo"
          style={{ transform: `scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      </div>

      <footer className="image-viewer-footer">
        <div className="viewer-reaction-strip" onClick={(e) => e.stopPropagation()}>
          <ReactionBar
            messageId={item.messageId}
            reactions={reactions}
            onUpdate={handleReactionsUpdate}
          />
          <ReactionPicker
            messageId={item.messageId}
            onUpdate={handleReactionsUpdate}
            className="viewer-picker compact"
          />
        </div>
        <div className="viewer-actions-row">
          <button type="button" className="viewer-action compact" onClick={save} disabled={saving}>
            {saved ? "Saved" : saving ? "…" : "Save"}
          </button>
          <a
            className="viewer-action compact"
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Open
          </a>
        </div>
      </footer>
    </div>
  );
}
