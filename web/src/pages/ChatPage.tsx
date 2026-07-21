import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteConversation,
  deleteMessage,
  editMessage,
  fetchConversationMedia,
  fetchConversations,
  fetchMe,
  fetchMessages,
  fetchThreadMessages,
  markConversationRead,
  messageAttachmentUrl,
  pinMessage,
  uploadFile,
} from "../api";
import type { ChatMessage, Conversation, User } from "../types";
import { avatarColor, formatDateSeparator, formatMessageTime, initials, isSameDay } from "../utils/ui";
import { renderMarkdown } from "../utils/markdown";
import { IconAttach, IconBack, IconSend } from "../components/Icons";
import MediaPanel from "../components/MediaPanel";
import ReactionBar from "../components/ReactionBar";
import InteractiveCard from "../components/InteractiveCard";
import ChannelPanel from "../components/ChannelPanel";
import ChatSettingsPanel from "../components/ChatSettingsPanel";
import ChatToolsModal from "../components/ChatToolsModal";
import CatchUpBanner from "../components/CatchUpBanner";
import {
  connectWebSocket,
  joinConversation,
  markRead,
  sendChatMessage,
  sendTyping,
  subscribe,
} from "../ws";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function clampMenuPosition(x: number, y: number) {
  const menuWidth = 168;
  const menuHeight = 96;
  const margin = 8;
  const maxX = window.innerWidth - menuWidth - margin;
  const maxY = window.innerHeight - menuHeight - margin;
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  };
}

function titleFor(conversation: Conversation | undefined) {
  if (!conversation) return "Chat";
  if (conversation.type === "channel") return `#${conversation.name || "channel"}`;
  if (conversation.type === "group") return conversation.name || "Group Chat";
  return conversation.other_user?.username ?? "Chat";
}

function subtitleFor(conversation: Conversation | undefined) {
  if (!conversation) return "";
  if (conversation.type === "group" || conversation.type === "channel") {
    const count = conversation.members.length;
    return `${count} member${count === 1 ? "" : "s"}${conversation.is_locked ? " · locked" : ""}`;
  }
  if (conversation.other_user?.is_online) return "online";
  return "last seen recently";
}

function resolveAttachmentUrl(message: ChatMessage): string | null {
  if (message.is_deleted || message.message_type === "text") return null;
  if (message.attachment_url?.includes("token=")) return message.attachment_url;
  return messageAttachmentUrl(message.id);
}

function canEditMessage(message: ChatMessage, meId?: number) {
  if (!meId || message.sender.id !== meId || message.is_deleted) return false;
  return Date.now() - new Date(message.created_at).getTime() <= EDIT_WINDOW_MS;
}

function wsMessageFromEvent(event: Record<string, unknown>, conversationId: number): ChatMessage {
  return {
    id: event.id as number,
    conversation: conversationId,
    parent_id: (event.parent_id as number | null) ?? null,
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
    card_type: (event.card_type as ChatMessage["card_type"]) ?? "",
    card_data: (event.card_data as ChatMessage["card_data"]) ?? {},
    transcript: (event.transcript as string) ?? "",
    edited_at: (event.edited_at as string | null) ?? null,
    created_at: (event.created_at as string) ?? new Date().toISOString(),
    read_by: (event.read_by as number[]) ?? [],
    reactions: (event.reactions as ChatMessage["reactions"]) ?? [],
    reply_count: (event.reply_count as number) ?? 0,
  };
}

function messageContent(message: ChatMessage) {
  if (message.is_deleted) {
    return <span className="bubble-deleted">This message was deleted</span>;
  }

  const url = resolveAttachmentUrl(message);
  if (message.message_type === "image" && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={message.file_name || "Image"} className="chat-image" />
      </a>
    );
  }

  if (message.message_type === "file" && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="file-link">
        📎 {message.file_name || "Download file"}
      </a>
    );
  }

  if (message.message_type === "audio" && url) {
    return (
      <div className="audio-message">
        <audio controls src={url} preload="none" />
        {message.transcript ? <p className="meta transcript">{message.transcript}</p> : null}
      </div>
    );
  }

  if (message.message_type === "card") {
    return null;
  }

  return (
    <span
      className="bubble-text markdown-body"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(message.body) }}
    />
  );
}

export default function ChatPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const conversationId = Number(id);
  const [me, setMe] = useState<User | null>(null);
  const [conversation, setConversation] = useState<Conversation | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<ChatMessage[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [activeThread, setActiveThread] = useState<ChatMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [urgentMode, setUrgentMode] = useState(false);
  const [channelPanelOpen, setChannelPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [msgMenu, setMsgMenu] = useState<{ messageId: number; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    connectWebSocket();
    Promise.all([fetchMe(), fetchConversations(), fetchMessages(conversationId)])
      .then(async ([profile, conversations, initialMessages]) => {
        setMe(profile);
        setConversation(conversations.find((item: Conversation) => item.id === conversationId));
        setMessages(initialMessages);
        joinConversation(conversationId);
        await markConversationRead(conversationId);
        markRead(conversationId);
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    const unsubscribe = subscribe((event) => {
      if (
        (event.type === "message.new" ||
          event.type === "message.updated" ||
          event.type === "message.deleted") &&
        event.conversation_id === conversationId
      ) {
        const incoming = wsMessageFromEvent(event, conversationId);
        setMessages((prev) => {
          const index = prev.findIndex((item) => item.id === incoming.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = incoming;
            return next;
          }
          if (event.type === "message.new") {
            return [...prev, incoming];
          }
          return prev;
        });
      }

      if (event.type === "message.read_update" && event.conversation_id === conversationId) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === event.message_id
              ? { ...message, read_by: (event.read_by as number[]) ?? [] }
              : message,
          ),
        );
      }

      if (event.type === "typing" && event.conversation_id === conversationId) {
        setTypingUser(event.is_typing ? (event.username as string) : null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  useEffect(() => {
    if (!loading && !editingMessage) inputRef.current?.focus();
  }, [loading, conversationId, editingMessage]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      setMsgMenu(null);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const expectedReaders = useMemo(() => {
    if (!conversation) return 1;
    const count = conversation.members.length || (conversation.type === "group" ? 0 : 2);
    return count > 0 ? count - 1 : 1;
  }, [conversation]);

  async function openMediaPanel() {
    setMenuOpen(false);
    setMediaOpen(true);
    setMediaLoading(true);
    try {
      const items = await fetchConversationMedia(conversationId);
      setMediaItems(items);
    } catch {
      setMediaItems([]);
    } finally {
      setMediaLoading(false);
    }
  }

  async function handleDeleteChat() {
    setMenuOpen(false);
    if (!window.confirm("Delete this chat? It will be removed from your chat list.")) return;
    try {
      await deleteConversation(conversationId);
      navigate("/");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete chat");
    }
  }

  function startEdit(message: ChatMessage) {
    setMsgMenu(null);
    setEditingMessage(message);
    setText(message.body);
    inputRef.current?.focus();
  }

  function cancelEdit() {
    setEditingMessage(null);
    setText("");
  }

  async function handleDeleteMessage(messageId: number) {
    setMsgMenu(null);
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      const updated = await deleteMessage(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to delete message");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;

    if (editingMessage) {
      try {
        const updated = await editMessage(editingMessage.id, body);
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        cancelEdit();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to edit message");
      }
      return;
    }

    sendTyping(conversationId, false);
    sendChatMessage(conversationId, body, {
      parentId: activeThread?.id,
      urgent: urgentMode,
    });
    setText("");
    setUrgentMode(false);
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(conversationId, file);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function openThread(message: ChatMessage) {
    setActiveThread(message);
    const replies = await fetchThreadMessages(conversationId, message.id);
    setThreadMessages(replies);
  }

  const chatTitle = titleFor(conversation);
  const isAdmin = Boolean(
    conversation?.members.some((m) => m.user.id === me?.id && m.role === "admin") || false,
  );
  const isChannel = conversation?.type === "channel";
  const avatarSeed =
    conversation?.type === "group" || conversation?.type === "channel"
      ? conversation.name || String(conversation.id)
      : conversation?.other_user?.username ?? chatTitle;
  const displayMessages = activeThread ? threadMessages : messages;

  const activeMenuMessage = msgMenu
    ? messages.find((m) => m.id === msgMenu.messageId)
    : null;

  return (
    <div className="chat-room">
      <div className="chat-topbar">
        <Link to="/" className="btn icon-btn ghost mobile-back" aria-label="Back to chats">
          <IconBack />
        </Link>
        <div
          className={`avatar sm ${conversation?.other_user?.is_online ? "" : "light-border"}`}
          style={{ background: avatarColor(avatarSeed) }}
        >
          {initials(chatTitle)}
          {conversation?.type === "direct" && conversation.other_user?.is_online ? (
            <span className="online-dot" style={{ borderColor: "#f0f2f5" }} />
          ) : null}
        </div>
        <div className="chat-topbar-info">
          <h2>{chatTitle}</h2>
          {typingUser ? (
            <p className="typing">
              {typingUser} is typing
              <span className="typing-dots" aria-hidden>
                <span /><span /><span />
              </span>
            </p>
          ) : (
            <p>{subtitleFor(conversation)}</p>
          )}
        </div>
        <div className="chat-topbar-menu" ref={menuRef}>
          <button
            className="btn icon-btn ghost"
            type="button"
            aria-label="Chat menu"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            ⋮
          </button>
          {menuOpen ? (
            <div className="dropdown-menu">
              <button type="button" onClick={openMediaPanel}>
                Media, links & docs
              </button>
              {isChannel ? (
                <button type="button" onClick={() => { setMenuOpen(false); setChannelPanelOpen(true); }}>
                  Channel panel
                </button>
              ) : null}
              <button type="button" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                Notifications & DND
              </button>
              <button type="button" onClick={() => { setMenuOpen(false); setToolsOpen(true); }}>
                Polls, approvals & schedule
              </button>
              <button type="button" className="danger" onClick={handleDeleteChat}>
                Delete chat
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeThread ? (
        <div className="thread-banner">
          <span>Thread: {activeThread.body.slice(0, 60)}</span>
          <button type="button" className="btn ghost" onClick={() => setActiveThread(null)}>
            Close
          </button>
        </div>
      ) : null}

      {!activeThread && !catchUpDismissed ? (
        <CatchUpBanner conversationId={conversationId} onDismiss={() => setCatchUpDismissed(true)} />
      ) : null}

      {!activeThread && messages.some((m) => m.is_pinned) ? (
        <div className="pinned-banner">
          📌 {messages.find((m) => m.is_pinned)?.body.slice(0, 80)}
        </div>
      ) : null}

      <div className="messages">
        {loading ? (
          <div className="loading-messages">
            <div className="spinner" />
            <p className="meta">Loading messages...</p>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">
              <IconSend size={28} />
            </div>
            <h2>{activeThread ? "No replies yet" : "No messages yet"}</h2>
            <p>{activeThread ? "Start the thread!" : "Say hello and start the conversation!"}</p>
          </div>
        ) : (
          displayMessages.map((message, index) => {
            const isMe = message.sender.id === me?.id;
            const prev = displayMessages[index - 1];
            const next = displayMessages[index + 1];
            const showDate = !prev || !isSameDay(prev.created_at, message.created_at);
            const isGrouped =
              prev &&
              prev.sender.id === message.sender.id &&
              isSameDay(prev.created_at, message.created_at) &&
              !prev.is_deleted &&
              !message.is_deleted;
            const nextGrouped =
              next &&
              next.sender.id === message.sender.id &&
              isSameDay(next.created_at, message.created_at) &&
              !next.is_deleted &&
              !message.is_deleted;
            const isRead = isMe && message.read_by.length >= expectedReaders;
            const receipt = isMe && !message.is_deleted ? (isRead ? "✓✓" : "✓") : "";
            const showSender =
              !isMe && (conversation?.type === "group" || conversation?.type === "channel") && !isGrouped;

            return (
              <div key={message.id}>
                {showDate ? (
                  <div className="date-separator">
                    <span>{formatDateSeparator(message.created_at)}</span>
                  </div>
                ) : null}
                <div className={`bubble-row ${isMe ? "me" : ""} ${isGrouped ? "grouped" : ""}`}>
                  <div className="bubble-wrap">
                    {showSender ? (
                      <p className="sender-name">{message.sender.username}</p>
                    ) : null}
                    <div
                      className={`bubble ${isMe ? "me" : ""} ${isGrouped || nextGrouped ? "grouped-bubble" : ""} ${message.is_deleted ? "deleted" : ""} ${message.is_urgent ? "urgent" : ""}`}
                      onContextMenu={(e) => {
                        if (!isMe || message.is_deleted) return;
                        e.preventDefault();
                        setMsgMenu({
                          messageId: message.id,
                          ...clampMenuPosition(e.clientX, e.clientY),
                        });
                      }}
                    >
                      {message.is_urgent ? <span className="urgent-badge">URGENT</span> : null}
                      {message.message_type === "card" ? (
                        <InteractiveCard
                          message={message}
                          meId={me?.id}
                          onUpdated={(updated) =>
                            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
                          }
                        />
                      ) : null}
                      {messageContent(message)}
                      {!message.is_deleted ? (
                        <span className="bubble-meta">
                          {message.edited_at ? <span className="edited-label">edited </span> : null}
                          {formatMessageTime(message.created_at)}
                          {receipt ? <span className="receipt">{receipt}</span> : null}
                        </span>
                      ) : null}
                      {isMe && !message.is_deleted ? (
                        <button
                          type="button"
                          className="bubble-menu-btn"
                          aria-label="Message options"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setMsgMenu({
                              messageId: message.id,
                              ...clampMenuPosition(rect.left, rect.bottom + 4),
                            });
                          }}
                        >
                          ▾
                        </button>
                      ) : null}
                    </div>
                    {!message.is_deleted ? (
                      <ReactionBar
                        messageId={message.id}
                        reactions={message.reactions ?? []}
                        onUpdate={(reactions) =>
                          setMessages((prev) =>
                            prev.map((m) => (m.id === message.id ? { ...m, reactions } : m)),
                          )
                        }
                      />
                    ) : null}
                    {!activeThread && !message.is_deleted && message.reply_count > 0 ? (
                      <button type="button" className="thread-link" onClick={() => openThread(message)}>
                        {message.reply_count} repl{message.reply_count === 1 ? "y" : "ies"}
                      </button>
                    ) : null}
                    {!activeThread && !message.is_deleted ? (
                      <button type="button" className="thread-link subtle" onClick={() => openThread(message)}>
                        Reply in thread
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {msgMenu && activeMenuMessage ? (
        <div
          className="msg-context-menu"
          style={{ top: msgMenu.y, left: msgMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {canEditMessage(activeMenuMessage, me?.id) &&
          (activeMenuMessage.message_type === "text" || activeMenuMessage.body) ? (
            <button type="button" onClick={() => startEdit(activeMenuMessage)}>
              Edit
            </button>
          ) : null}
          {!activeThread ? (
            <button type="button" onClick={() => { openThread(activeMenuMessage); setMsgMenu(null); }}>
              Reply in thread
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              const updated = await pinMessage(activeMenuMessage.id);
              setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
              setMsgMenu(null);
            }}
          >
            {activeMenuMessage.is_pinned ? "Unpin" : "Pin message"}
          </button>
          <button type="button" className="danger" onClick={() => handleDeleteMessage(activeMenuMessage.id)}>
            Delete
          </button>
        </div>
      ) : null}

      {editingMessage ? (
        <div className="edit-banner">
          <span>Editing message</span>
          <button type="button" className="btn ghost" onClick={cancelEdit}>
            Cancel
          </button>
        </div>
      ) : null}

      <form className="composer" onSubmit={onSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*,.pdf,.txt,.zip,.doc,.docx,audio/*"
          onChange={onFileSelected}
        />
        {!editingMessage ? (
          <button
            className="attach-btn"
            type="button"
            disabled={uploading || loading}
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
          >
            <IconAttach />
          </button>
        ) : null}
        <div className="composer-input-wrap">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!editingMessage) {
                sendTyping(conversationId, e.target.value.trim().length > 0);
              }
            }}
            placeholder={
              editingMessage ? "Edit your message" : activeThread ? "Reply in thread" : "Type a message"
            }
            disabled={loading}
          />
        </div>
        {!editingMessage ? (
          <button
            type="button"
            className={`urgent-toggle ${urgentMode ? "active" : ""}`}
            onClick={() => setUrgentMode((v) => !v)}
            title="Mark as urgent"
          >
            !
          </button>
        ) : null}
        <button
          className="send-btn"
          type="submit"
          disabled={!text.trim() || loading}
          aria-label={editingMessage ? "Save edit" : "Send"}
        >
          {editingMessage ? "✓" : <IconSend />}
        </button>
      </form>

      <MediaPanel
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        items={mediaItems}
        loading={mediaLoading}
      />

      {channelPanelOpen && isChannel ? (
        <ChannelPanel
          conversationId={conversationId}
          isAdmin={isAdmin}
          onClose={() => setChannelPanelOpen(false)}
        />
      ) : null}

      {settingsOpen ? (
        <ChatSettingsPanel
          conversationId={conversationId}
          isAdmin={isAdmin}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {toolsOpen ? (
        <ChatToolsModal
          conversationId={conversationId}
          onClose={() => setToolsOpen(false)}
          onCreated={() => fetchMessages(conversationId).then(setMessages)}
        />
      ) : null}
    </div>
  );
}
