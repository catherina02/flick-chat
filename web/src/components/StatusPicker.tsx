import { useState } from "react";
import { updateStatus } from "../api";
import type { PresenceStatus, User } from "../types";
import { presenceLabel } from "../utils/markdown";

const STATUSES: { value: PresenceStatus; label: string; icon: string }[] = [
  { value: "online", label: "Online", icon: "🟢" },
  { value: "away", label: "Away", icon: "🟡" },
  { value: "busy", label: "In a meeting", icon: "🔴" },
  { value: "ooo", label: "Out of office", icon: "⛔" },
];

type StatusPickerProps = {
  me: User;
  onUpdate: (user: User) => void;
};

export default function StatusPicker({ me, onUpdate }: StatusPickerProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(me.status_message || "");

  async function pick(status: PresenceStatus) {
    const updated = await updateStatus({ presence_status: status, status_message: custom });
    onUpdate(updated);
    setOpen(false);
  }

  async function saveCustom() {
    const updated = await updateStatus({ status_message: custom });
    onUpdate(updated);
    setOpen(false);
  }

  return (
    <div className="status-picker">
      <button type="button" className="status-trigger" onClick={() => setOpen((v) => !v)}>
        <span className={`status-dot status-${me.presence_status}`} />
        {presenceLabel(me.presence_status, me.status_message)}
      </button>
      {open ? (
        <div className="status-menu">
          {STATUSES.map((s) => (
            <button key={s.value} type="button" onClick={() => pick(s.value)}>
              {s.icon} {s.label}
            </button>
          ))}
          <div className="status-custom">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom status..."
              maxLength={120}
            />
            <button type="button" className="btn secondary" onClick={saveCustom}>
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
