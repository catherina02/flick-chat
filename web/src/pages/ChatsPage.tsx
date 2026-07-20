import { useEffect, useState } from "react";

import { Link, useNavigate } from "react-router-dom";

import { connectWebSocket, disconnectWebSocket, joinConversation, subscribe } from "../ws";

import {

  createDirectChat,

  fetchConversations,

  fetchMe,

  fetchNotifications,

  fetchUnreadNotificationCount,

  fetchUsers,

  logout,

  markAllNotificationsRead,

  markNotificationRead,

} from "../api";

import type { AppNotification, Conversation, User } from "../types";



function titleFor(conversation: Conversation) {

  if (conversation.type === "group") {

    return conversation.name || "Group Chat";

  }

  return conversation.other_user?.username ?? "Chat";

}



function previewFor(conversation: Conversation) {

  const message = conversation.last_message;

  if (!message) return "No messages yet";

  if (message.message_type === "image") return "📷 Image";

  if (message.message_type === "file") return `📎 ${message.file_name || "File"}`;

  return message.body;

}



export default function ChatsPage() {

  const navigate = useNavigate();

  const [me, setMe] = useState<User | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [users, setUsers] = useState<User[]>([]);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [unreadCount, setUnreadCount] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);



  useEffect(() => {

    connectWebSocket();

    Promise.all([fetchMe(), fetchConversations(), fetchUsers(), fetchUnreadNotificationCount()])

      .then(([profile, chats, allUsers, unread]) => {

        setMe(profile);

        setConversations(chats);

        setUsers(allUsers);

        setUnreadCount(unread.count);

      })

      .catch((err) => setError(err.message));



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

            },

            message_type: (event.message_type as ChatMessage["message_type"]) ?? "text",

            body: (event.body as string) ?? "",

            attachment_url: (event.attachment_url as string | null) ?? null,

            file_name: (event.file_name as string) ?? "",

            file_size: (event.file_size as number) ?? 0,

            created_at: (event.created_at as string) ?? new Date().toISOString(),

            read_by: (event.read_by as number[]) ?? [],

          };

          const rest = prev.filter((item) => item.id !== conversationId);

          return [updated, ...rest];

        });

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

    const items = await fetchNotifications();

    setNotifications(items);

  }



  async function startDirect(userId: number) {

    const conversation = await createDirectChat(userId);

    setShowNew(false);

    navigate(`/chat/${conversation.id}`);

  }



  return (

    <div className="chat-layout">

      <div className="chat-header">

        <div>

          <h1>Chats</h1>

          {me ? <p>Signed in as {me.username}</p> : null}

        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

          <button

            className="btn secondary notification-btn"

            type="button"

            onClick={openNotifications}

          >

            🔔

            {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}

          </button>

          <button className="btn secondary" type="button" onClick={() => setShowNew((v) => !v)}>

            New Chat

          </button>

          <Link className="btn secondary" to="/create-group">

            New Group

          </Link>

          <button

            className="btn secondary"

            type="button"

            onClick={async () => {

              await logout();

              navigate("/login");

            }}

          >

            Logout

          </button>

        </div>

      </div>



      {error ? <div className="error">{error}</div> : null}



      {showNotifications ? (

        <div className="card notifications-panel">

          <div className="panel-header">

            <h3>Notifications</h3>

            <button

              className="btn secondary"

              type="button"

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

        <div className="card" style={{ marginBottom: 16 }}>

          <h3>Start a conversation</h3>

          <div className="chat-list" style={{ marginTop: 12 }}>

            {users.map((user) => (

              <button

                key={user.id}

                className="btn secondary"

                type="button"

                onClick={() => startDirect(user.id)}

              >

                Chat with {user.username}

              </button>

            ))}

          </div>

        </div>

      ) : null}



      <div className="chat-list">

        {conversations.map((conversation) => (

          <Link key={conversation.id} to={`/chat/${conversation.id}`} className="card chat-item">

            <div className="avatar">{titleFor(conversation).slice(0, 1).toUpperCase()}</div>

            <div>

              <strong>{titleFor(conversation)}</strong>

              <div className="meta">{previewFor(conversation)}</div>

            </div>

          </Link>

        ))}

      </div>

    </div>

  );

}



// Local type alias for message preview

type ChatMessage = import("../types").ChatMessage;


