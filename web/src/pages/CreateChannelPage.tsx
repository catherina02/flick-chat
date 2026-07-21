import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createChannel, fetchUsers } from "../api";
import type { User } from "../types";
import { avatarColor, initials } from "../utils/ui";
import { IconBack } from "../components/Icons";

export default function CreateChannelPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchUsers().then(setUsers).catch((err) => setError(err.message));
  }, []);

  const filteredUsers = useMemo(() => users, [users]);

  function toggleUser(userId: number) {
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim().replace(/^#/, "");
    if (!trimmed) {
      setError("Channel name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const conversation = await createChannel(trimmed, description.trim(), isPublic, selected);
      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel.");
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
        <h1>Create Channel</h1>
        <p>Topic-based channels for team announcements and discussions.</p>

        <form className="group-form" onSubmit={onSubmit}>
          <label>
            Channel name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="announcements"
              autoFocus
            />
          </label>
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel for?"
            />
          </label>
          <label className="member-item" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span className="name">Public channel (anyone can join)</span>
          </label>

          <div>
            <strong>Add members (optional)</strong>
            <div className="member-list">
              {filteredUsers.map((user) => (
                <label key={user.id} className="member-item">
                  <div className="avatar sm light-border" style={{ background: avatarColor(user.username) }}>
                    {initials(user.username)}
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span className="name">{user.username}</span>
                </label>
              ))}
            </div>
          </div>

          {error ? <div className="error">{error}</div> : null}
          <button className="btn" type="submit" disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create Channel"}
          </button>
        </form>
      </div>
    </div>
  );
}
