import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createGroupChat, fetchUsers } from "../api";
import type { User } from "../types";
import { avatarColor, initials } from "../utils/ui";
import { IconBack } from "../components/Icons";

export default function CreateGroupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.username.toLowerCase().includes(q));
  }, [users, memberSearch]);

  function toggleUser(userId: number) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Group name is required.");
      return;
    }
    if (selected.length < 2) {
      setError("Select at least 2 other members.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const conversation = await createGroupChat(trimmed, selected);
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-panel">
      <div className="page-card">
        <Link to="/" className="back-link">
          <IconBack size={16} /> Back to chats
        </Link>
        <h1>Create Group</h1>
        <p>Add a name and pick at least 2 members to get started.</p>

        <form className="group-form" onSubmit={onSubmit}>
          <label>
            Group name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Study group, project team..."
              autoFocus
            />
          </label>

          <div>
            <div className="member-section-header">
              <strong>Add members</strong>
              <span className="member-count">{selected.length} selected</span>
            </div>
            <div className="search-box" style={{ marginBottom: 10 }}>
              <input
                type="search"
                placeholder="Search members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1.5px solid var(--border)",
                  borderRadius: 10,
                  background: "#f8fafc",
                }}
              />
            </div>
            <div className="member-list">
              {filteredUsers.map((user) => (
                <label key={user.id} className="member-item">
                  <div className="avatar sm light-border" style={{ background: avatarColor(user.username) }}>
                    {initials(user.username)}
                    {user.is_online ? <span className="online-dot" style={{ borderColor: "#fff" }} /> : null}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span className="name">{user.username}</span>
                  <span className="meta">{user.is_online ? "Online" : "Offline"}</span>
                </label>
              ))}
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="btn" type="submit" disabled={loading || selected.length < 2 || !name.trim()}>
            {loading ? "Creating..." : "Create Group"}
          </button>
        </form>
      </div>
    </div>
  );
}
