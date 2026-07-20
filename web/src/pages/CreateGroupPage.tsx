import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createGroupChat, fetchUsers } from "../api";
import type { User } from "../types";
import { avatarColor, initials } from "../utils/ui";

export default function CreateGroupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => setError(err.message));
  }, []);

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
          ← Back to chats
        </Link>
        <h1>Create Group</h1>
        <p>Add a name and pick at least 2 members.</p>

        <form className="group-form" onSubmit={onSubmit}>
          <label>
            Group name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Study group, project team..."
            />
          </label>

          <div>
            <strong>Select members ({selected.length} selected, min 2)</strong>
            <div className="member-list">
              {users.map((user) => (
                <label key={user.id} className="member-item">
                  <div className="avatar sm" style={{ background: avatarColor(user.username) }}>
                    {initials(user.username)}
                    {user.is_online ? <span className="online-dot" /> : null}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span>{user.username}</span>
                  <span className="meta">{user.is_online ? "Online" : "Offline"}</span>
                </label>
              ))}
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Group"}
          </button>
        </form>
      </div>
    </div>
  );
}
