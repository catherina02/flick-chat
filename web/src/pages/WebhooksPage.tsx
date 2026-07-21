import { useEffect, useState } from "react";
import { createWebhook, deleteWebhook, fetchWebhooks } from "../api";
import type { WebhookConfig } from "../types/enterprise";
import { Link } from "react-router-dom";

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [conversationId, setConversationId] = useState("");

  useEffect(() => {
    fetchWebhooks().then(setWebhooks).catch(console.error);
  }, []);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    const created = await createWebhook({
      name: name.trim(),
      url: url.trim(),
      direction: "outgoing",
      events: ["message.new"],
      conversation: conversationId ? Number(conversationId) : null,
      is_active: true,
    });
    setWebhooks((prev) => [created, ...prev]);
    setName("");
    setUrl("");
    setConversationId("");
  }

  return (
    <div className="page-panel">
      <div className="page-card">
        <Link to="/" className="back-link">← Back to chats</Link>
        <h1>Webhooks</h1>
        <p>Connect Flick Chat to external tools with incoming and outgoing webhooks.</p>

        <form className="group-form" onSubmit={onCreate}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Webhook name" required />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Outgoing URL" />
          <input value={conversationId} onChange={(e) => setConversationId(e.target.value)} placeholder="Channel ID (optional)" />
          <button type="submit" className="btn">Create webhook</button>
        </form>

        <ul className="webhook-list">
          {webhooks.map((hook) => (
            <li key={hook.id} className="webhook-item">
              <div>
                <strong>{hook.name}</strong>
                <div className="meta">{hook.direction} · secret: {hook.secret.slice(0, 8)}…</div>
              </div>
              <button
                type="button"
                className="btn secondary"
                onClick={async () => {
                  await deleteWebhook(hook.id);
                  setWebhooks((prev) => prev.filter((w) => w.id !== hook.id));
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
