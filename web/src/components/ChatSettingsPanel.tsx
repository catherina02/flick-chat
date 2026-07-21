import { useEffect, useState } from "react";
import {
  fetchConversationSettings,
  fetchNotificationPrefs,
  updateConversationSettings,
  updateNotificationPrefs,
} from "../api";
import type { ConversationSettings, NotificationPrefs } from "../types/enterprise";

type ChatSettingsPanelProps = {
  conversationId: number;
  isAdmin: boolean;
  onClose: () => void;
};

export default function ChatSettingsPanel({ conversationId, isAdmin, onClose }: ChatSettingsPanelProps) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [settings, setSettings] = useState<ConversationSettings | null>(null);

  useEffect(() => {
    Promise.all([
      fetchNotificationPrefs(),
      fetchConversationSettings(conversationId),
    ]).then(([p, s]) => {
      setPrefs(p);
      setSettings(s);
    });
  }, [conversationId]);

  async function savePrefs(patch: Partial<NotificationPrefs>) {
    const updated = await updateNotificationPrefs(patch);
    setPrefs(updated);
  }

  async function saveSettings(patch: Partial<ConversationSettings>) {
    const updated = await updateConversationSettings(conversationId, patch);
    setSettings(updated);
  }

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <aside className="side-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>Settings</h3>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>

        {prefs ? (
          <section className="panel-section">
            <h4>Do Not Disturb & work hours</h4>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={prefs.dnd_enabled}
                onChange={(e) => void savePrefs({ dnd_enabled: e.target.checked })}
              />
              Enable DND (urgent messages still notify)
            </label>
            <label>
              Work hours start
              <input
                type="time"
                value={prefs.work_hours_start?.slice(0, 5) || ""}
                onChange={(e) => void savePrefs({ work_hours_start: e.target.value || null })}
              />
            </label>
            <label>
              Work hours end
              <input
                type="time"
                value={prefs.work_hours_end?.slice(0, 5) || ""}
                onChange={(e) => void savePrefs({ work_hours_end: e.target.value || null })}
              />
            </label>
          </section>
        ) : null}

        {settings ? (
          <section className="panel-section">
            <h4>Channel notifications</h4>
            <select
              value={settings.notification_level}
              onChange={(e) =>
                void saveSettings({
                  notification_level: e.target.value as ConversationSettings["notification_level"],
                })
              }
            >
              <option value="all">All messages</option>
              <option value="mentions">Mentions only</option>
              <option value="mute">Mute</option>
            </select>

            {isAdmin ? (
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={settings.is_locked}
                  onChange={(e) => void saveSettings({ is_locked: e.target.checked })}
                />
                Lock channel (read-only for members)
              </label>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
