import { useEffect, useState } from "react";
import {
  addChannelResource,
  fetchChannelResources,
  fetchConversationSettings,
  updateConversationSettings,
} from "../api";
import type { ChannelResource } from "../types";
import type { ConversationSettings } from "../types/enterprise";

type ChannelPanelProps = {
  conversationId: number;
  isAdmin: boolean;
  onClose: () => void;
};

export default function ChannelPanel({ conversationId, isAdmin, onClose }: ChannelPanelProps) {
  const [resources, setResources] = useState<ChannelResource[]>([]);
  const [settings, setSettings] = useState<ConversationSettings | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [canvas, setCanvas] = useState("");

  useEffect(() => {
    Promise.all([
      fetchChannelResources(conversationId),
      fetchConversationSettings(conversationId),
    ]).then(([items, s]) => {
      setResources(items);
      setSettings(s);
      setCanvas(s.canvas_body || "");
    });
  }, [conversationId]);

  async function saveCanvas() {
    const updated = await updateConversationSettings(conversationId, { canvas_body: canvas });
    setSettings(updated);
  }

  async function addResource(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const item = await addChannelResource(conversationId, { title: title.trim(), url: url.trim() });
    setResources((prev) => [item, ...prev]);
    setTitle("");
    setUrl("");
  }

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <aside className="side-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Channel panel</h3>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>

        <section className="panel-section">
          <h4>Living canvas</h4>
          {isAdmin ? (
            <>
              <textarea
                value={canvas}
                onChange={(e) => setCanvas(e.target.value)}
                placeholder="Team guidelines, links, contacts..."
                rows={5}
              />
              <button type="button" className="btn secondary" onClick={saveCanvas}>Save canvas</button>
            </>
          ) : (
            <div className="canvas-readonly markdown-body">{canvas || "No canvas content yet."}</div>
          )}
        </section>

        <section className="panel-section">
          <h4>Pinned resources</h4>
          <form className="resource-form" onSubmit={addResource}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL (optional)" />
            <button type="submit" className="btn secondary">Add</button>
          </form>
          <ul className="resource-list">
            {resources.map((r) => (
              <li key={r.id}>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                ) : (
                  <span>{r.title}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {settings ? (
          <section className="panel-section">
            <p className="meta">Notifications: {settings.notification_level}</p>
            {settings.is_locked ? <p className="meta locked-label">🔒 Channel is read-only</p> : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
