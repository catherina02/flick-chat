import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  createDirectChat,
  fetchConversations,
  fetchMe,
  fetchNotifications,
  fetchPublicChannels,
  fetchUnreadNotificationCount,
  fetchUsers,
  joinChannel,
  logout,
  markAllNotificationsRead,
  markNotificationRead,
  searchMessages,
} from "../api";
import type { AppNotification, ChatMessage, Conversation, User } from "../types";
import { avatarColor, formatListTime, initials } from "../utils/ui";
import { connectWebSocket, disconnectWebSocket, joinConversation, subscribe } from "../ws";
import StatusPicker from "./StatusPicker";
import {
  IconBell,
  IconChat,
  IconEdit,
  IconGroup,
  IconLogout,
  IconSearch,
  IconUsers,
} from "./Icons";

function titleFor(conversation: Conversation) {
  if (conversation.type === "channel") return `#${conversation.name || "channel"}`;
  if (conversation.type === "group") return conversation.name || "Group Chat";
  return conversation.other_user?.username ?? "Chat";
}

function previewFor(conversation: Conversation, meId?: number) {
  const message = conversation.last_message;
  if (!message) return "No messages yet";
  if (message.is_deleted) return "This message was deleted";
  const prefix = message.sender.id === meId ? "You: " : "";
  if (message.message_type === "image") return `${prefix}📷 Photo`;
  if (message.message_type === "file") return `${prefix}📎 ${message.file_name || "File"}`;
  return `${prefix}${message.body}`;
}

function avatarSeed(conversation: Conversation) {
  if (conversation.type === "group") return conversation.name || String(conversation.id);
  return conversation.other_user?.username ?? String(conversation.id);
}

function ConversationSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-item">
          <div className="skeleton skeleton-avatar" />
          <div className="skeleton-lines">
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      ))}
    </>
  );
}

export function ChatEmptyState() {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state-icon">
        <IconChat size={36} />
      </div>
      <h2>Flick Chat for Web</h2>
      <p>Send and receive messages without keeping your phone online.<br />Select a chat to start messaging.</p>
    </div>
  );
}

export default function MessengerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const activeId = id ? Number(id) : null;
  const isChatRoute = location.pathname.startsWith("/chat/");

  const [me, setMe] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [publicChannels, setPublicChannels] = useState<Conversation[]>([]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((c) => titleFor(c).toLowerCase().includes(query));
  }, [conversations, search]);

  useEffect(() => {
    connectWebSocket();
    void Promise.allSettled([
      fetchMe(),
      fetchConversations(),
      fetchUsers(),
      fetchUnreadNotificationCount(),
      fetchPublicChannels(),
    ]).then(([meResult, chatsResult, usersResult, unreadResult, channelsResult]) => {
      if (meResult.status === "fulfilled") {
        setMe(meResult.value);
      } else {
        setError(meResult.reason instanceof Error ? meResult.reason.message : "Failed to load profile.");
      }

      if (chatsResult.status === "fulfilled") {
        setConversations(chatsResult.value);
        chatsResult.value.forEach((c: Conversation) => joinConversation(c.id));
      } else {
        setError(
          chatsResult.reason instanceof Error
            ? chatsResult.reason.message
            : "Failed to load conversations.",
        );
      }

      if (usersResult.status === "fulfilled") setUsers(usersResult.value);
      if (unreadResult.status === "fulfilled") setUnreadCount(unreadResult.value.count);
      if (channelsResult.status === "fulfilled") setPublicChannels(channelsResult.value);
    }).finally(() => setLoading(false));

    const unsubscribe = subscribe((event) => {
      if (event.type === "conversation.created" && event.conversation) {
        const conversation = event.conversation as Conversation;
        setConversations((prev) => {
          if (prev.some((item) => item.id === conversation.id)) return prev;
          joinConversation(conversation.id);
          return [conversation, ...prev];
        });
      }

      if (event.type === "message.new" && event.conversation_id) {
        const conversationId = event.conversation_id as number;
        setConversations((prev) => {
          const index = prev.findIndex((item) => item.id === conversationId);
          if (index < 0) return prev;
          const updated = { ...prev[index] };
          updated.last_message = {
            id: event.id as number,
            conversation: conversationId,
            sender: {
              id: event.sender_id as number,
              username: (event.sender as string) ?? "",
              email: "",
              is_online: true,
              presence_status: "online",
              status_message: "",
            },
            message_type: (event.message_type as ChatMessage["message_type"]) ?? "text",
            body: (event.body as string) ?? "",
            attachment_url: (event.attachment_url as string | null) ?? null,
            file_name: (event.file_name as string) ?? "",
            file_size: (event.file_size as number) ?? 0,
            is_deleted: Boolean(event.is_deleted),
            is_pinned: Boolean(event.is_pinned),
            is_urgent: Boolean(event.is_urgent),
            edited_at: (event.edited_at as string | null) ?? null,
            parent_id: (event.parent_id as number | null) ?? null,
            reactions: (event.reactions as ChatMessage["reactions"]) ?? [],
            reply_count: (event.reply_count as number) ?? 0,
            created_at: (event.created_at as string) ?? new Date().toISOString(),
            read_by: (event.read_by as number[]) ?? [],
          };
          updated.updated_at = updated.last_message?.created_at ?? new Date().toISOString();
          const rest = prev.filter((item) => item.id !== conversationId);
          return [updated, ...rest];
        });
      }

      if (
        (event.type === "message.updated" || event.type === "message.deleted") &&
        event.conversation_id
      ) {
        const conversationId = event.conversation_id as number;
        setConversations((prev) =>
          prev.map((item) => {
            if (item.id !== conversationId || !item.last_message) return item;
            if (item.last_message.id !== event.id) return item;
            return {
              ...item,
              last_message: {
                ...item.last_message,
                body: (event.body as string) ?? "",
                is_deleted: Boolean(event.is_deleted),
                edited_at: (event.edited_at as string | null) ?? null,
              },
            };
          }),
        );
      }

      if (event.type === "conversation.deleted" && event.conversation_id) {
        setConversations((prev) =>
          prev.filter((item) => item.id !== (event.conversation_id as number)),
        );
      }

      if (event.type === "notification.new" && event.notification) {
        const notification = event.notification as AppNotification;
        setNotifications((prev) => [notification, ...prev]);
        setUnreadCount((count) => count + 1);
        if (Notification.permission === "granted" && document.hidden) {
          new Notification(notification.title, { body: notification.body });
        }
      }
    });

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    return () => {
      unsubscribe();
      disconnectWebSocket();
    };
  }, []);

  async function openNotifications() {
    setShowNotifications(true);
    setShowNew(false);
    const items = await fetchNotifications();
    setNotifications(items);
  }

  async function runGlobalSearch(query: string) {
    setGlobalSearch(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const results = await searchMessages(query);
    setSearchResults(results);
  }

  async function handleJoinChannel(channelId: number) {
    const conversation = await joinChannel(channelId);
    setPublicChannels((prev) => prev.filter((c) => c.id !== channelId));
    setConversations((prev) => [conversation, ...prev]);
    navigate(`/chat/${channelId}`);
  }

  async function startDirect(userId: number) {
    const conversation = await createDirectChat(userId);
    setShowNew(false);
    navigate(`/chat/${conversation.id}`);
  }

  return (
    <div className={`app-frame messenger ${isChatRoute ? "has-chat" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">
            {me ? (
              <div className="avatar sm" style={{ background: avatarColor(me.username) }}>
                {initials(me.username)}
              </div>
            ) : (
              <div className="avatar sm skeleton" />
            )}
            <div>
              <h1>Chats</h1>
              {me ? (
                <div className="sidebar-status-row">
                  <p className="sidebar-subtitle">{me.username}</p>
                  <StatusPicker me={me} onUpdate={setMe} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="sidebar-actions">
            <button
              className="btn icon-btn ghost notification-btn"
              type="button"
              onClick={openNotifications}
              title="Notifications"
            >
              <IconBell />
              {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}
            </button>
            <button
              className="btn icon-btn ghost"
              type="button"
              onClick={() => {
                setShowNew((v) => !v);
                setShowNotifications(false);
              }}
              title="New chat"
            >
              <IconEdit />
            </button>
            <Link className="btn icon-btn ghost" to="/create-group" title="New group">
              <IconUsers />
            </Link>
            <Link className="btn icon-btn ghost" to="/create-channel" title="New channel">
              #
            </Link>
            <Link className="btn icon-btn ghost" to="/webhooks" title="Webhooks">
              ↗
            </Link>
            <button
              className="btn icon-btn ghost"
              type="button"
              title="Logout"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <IconLogout />
            </button>
          </div>
        </div>

        <div className="sidebar-toolbar">
          <div className="search-box">
            <span className="search-icon"><IconSearch size={16} /></span>
            <input
              type="search"
              placeholder="Search chats"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="search-box global-search">
            <span className="search-icon"><IconSearch size={16} /></span>
            <input
              type="search"
              placeholder="Search all messages"
              value={globalSearch}
              onChange={(e) => void runGlobalSearch(e.target.value)}
            />
          </div>
        </div>

        {searchResults.length > 0 ? (
          <div className="search-results-panel">
            <div className="panel-header">
              <h3>Search results</h3>
              <button
                className="btn ghost"
                type="button"
                style={{ fontSize: "0.8125rem", padding: "6px 10px" }}
                onClick={() => {
                  setGlobalSearch("");
                  setSearchResults([]);
                }}
              >
                Clear
              </button>
            </div>
            <div className="search-results-list">
              {searchResults.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className="search-result-item"
                  onClick={() => {
                    if (message.conversation) {
                      navigate(`/chat/${message.conversation}`);
                      setSearchResults([]);
                      setGlobalSearch("");
                    }
                  }}
                >
                  <strong>{message.sender.username}</strong>
                  <div className="meta">{message.body}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {publicChannels.length > 0 ? (
          <div className="public-channels-panel">
            <div className="panel-header">
              <h3>Public channels</h3>
            </div>
            <div className="public-channels-list">
              {publicChannels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  className="public-channel-item"
                  onClick={() => void handleJoinChannel(channel.id)}
                >
                  <span className="channel-hash">#</span>
                  <span>{channel.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <div className="error" style={{ margin: "0 14px 10px" }}>{error}</div> : null}

        {showNotifications ? (
          <div className="notifications-panel">
            <div className="panel-header">
              <h3>Notifications</h3>
              <button
                className="btn ghost"
                type="button"
                style={{ fontSize: "0.8125rem", padding: "6px 10px" }}
                onClick={async () => {
                  await markAllNotificationsRead();
                  setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
                  setUnreadCount(0);
                }}
              >
                Mark all read
              </button>
            </div>
            <div className="notification-list">
              {notifications.length === 0 ? (
                <p className="meta">No notifications yet.</p>
              ) : (
                notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={`notification-item ${notification.is_read ? "" : "unread"}`}
                    onClick={async () => {
                      await markNotificationRead(notification.id);
                      setNotifications((prev) =>
                        prev.map((item) =>
                          item.id === notification.id ? { ...item, is_read: true } : item,
                        ),
                      );
                      setUnreadCount((count) => Math.max(0, count - 1));
                      if (notification.conversation) {
                        navigate(`/chat/${notification.conversation}`);
                        setShowNotifications(false);
                      }
                    }}
                  >
                    <strong>{notification.title}</strong>
                    <div className="meta">{notification.body}</div>
                  </button>
                ))
              )}
            </div>
            <button className="btn secondary" type="button" onClick={() => setShowNotifications(false)}>
              Close
            </button>
          </div>
        ) : null}

        {showNew ? (
          <div className="overlay-panel">
            <h3>New conversation</h3>
            <div className="user-pick-list">
              {users
                .filter((user) => user.id !== me?.id)
                .map((user) => (
                  <button
                    key={user.id}
                    className="user-pick-item"
                    type="button"
                    onClick={() => startDirect(user.id)}
                  >
                    <div className="avatar sm" style={{ background: avatarColor(user.username) }}>
                      {initials(user.username)}
                      {user.is_online ? <span className="online-dot" /> : null}
                    </div>
                    <span>{user.username}</span>
                    {user.is_online ? <span className="meta" style={{ marginLeft: "auto" }}>online</span> : null}
                  </button>
                ))}
            </div>
          </div>
        ) : null}

        <div className="conversation-list">
          {loading ? (
            <ConversationSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="empty-state">
              <p>{search ? "No chats match your search" : "No conversations yet — start a new chat!"}</p>
              {!search ? (
                <div className="empty-state-actions">
                  <button className="btn secondary" type="button" onClick={() => setShowNew(true)}>
                    New chat
                  </button>
                  <Link className="btn" to="/create-group">New group</Link>
                </div>
              ) : null}
            </div>
          ) : (
            filteredConversations.map((conversation) => {
              const seed = avatarSeed(conversation);
              const isOnline =
                conversation.type === "direct" && conversation.other_user?.is_online;
              const isGroup = conversation.type === "group";
              const isChannel = conversation.type === "channel";
              return (
                <Link
                  key={conversation.id}
                  to={`/chat/${conversation.id}`}
                  className={`conversation-item ${activeId === conversation.id ? "active" : ""}`}
                >
                  <div className="avatar" style={{ background: avatarColor(seed) }}>
                    {initials(titleFor(conversation))}
                    {isOnline ? <span className="online-dot" /> : null}
                  </div>
                  <div className="conversation-body">
                    <div className="conversation-top">
                      <strong>
                        {titleFor(conversation)}
                        {isGroup ? (
                          <span className="group-badge"><IconGroup /></span>
                        ) : null}
                        {isChannel ? (
                          <span className="channel-badge">channel</span>
                        ) : null}
                      </strong>
                      <span className="conversation-time">
                        {formatListTime(conversation.last_message?.created_at ?? conversation.updated_at)}
                      </span>
                    </div>
                    <div className="conversation-preview">
                      {previewFor(conversation, me?.id)}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      <main className="chat-panel">
        <Outlet />
      </main>
    </div>
  );
}
