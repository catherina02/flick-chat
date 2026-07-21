import type { Conversation, User } from "../types";
import { avatarColor, initials } from "../utils/ui";

type GroupInfoPanelProps = {
  conversation: Conversation;
  me: User | null;
  onClose: () => void;
  onViewMedia: () => void;
  onDeleteGroup: () => void;
};

export default function GroupInfoPanel({
  conversation,
  me,
  onClose,
  onViewMedia,
  onDeleteGroup,
}: GroupInfoPanelProps) {
  const isGroup = conversation.type === "group";
  const isChannel = conversation.type === "channel";
  const title = isChannel
    ? `#${conversation.name || "channel"}`
    : conversation.name || "Group Chat";
  const seed = conversation.name || String(conversation.id);

  return (
    <div className="side-panel-overlay" onClick={onClose}>
      <aside className="side-panel group-info-panel" onClick={(e) => e.stopPropagation()}>
        <div className="group-info-header">
          <div className="avatar lg" style={{ background: avatarColor(seed) }}>
            {initials(title)}
          </div>
          <h2>{title}</h2>
          {conversation.description ? (
            <p className="meta">{conversation.description}</p>
          ) : null}
          <p className="meta">
            {conversation.members.length} member{conversation.members.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="group-info-actions">
          <button type="button" className="group-info-action" onClick={onViewMedia}>
            <span className="group-info-action-icon">🖼</span>
            View media
          </button>
        </div>

        <section className="panel-section">
          <h4>Members</h4>
          <ul className="group-member-list">
            {conversation.members.map((member) => (
              <li key={member.user.id} className="group-member-item">
                <div className="avatar sm" style={{ background: avatarColor(member.user.username) }}>
                  {initials(member.user.username)}
                </div>
                <div className="group-member-meta">
                  <strong>
                    {member.user.username}
                    {member.user.id === me?.id ? " (You)" : ""}
                  </strong>
                  <span className="meta">{member.role}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="btn danger group-leave-btn" onClick={onDeleteGroup}>
          {isGroup ? "Delete group" : isChannel ? "Leave channel" : "Delete chat"}
        </button>

        <button type="button" className="btn secondary" onClick={onClose}>
          Close
        </button>
      </aside>
    </div>
  );
}
