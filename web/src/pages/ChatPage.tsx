import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteConversation,
  deleteMessage,
  editMessage,
  fetchConversation,
  fetchConversationMedia,
  fetchMe,
  fetchMessages,
  fetchThreadMessages,
  markConversationRead,
  messageAttachmentUrl,
  pinMessage,
  uploadFile,
  isImageMessage,
} from "../api";
import type { ChatMessage, Conversation, User } from "../types";
import { avatarColor, formatMessageTime, initials } from "../utils/ui";
import { renderMarkdown } from "../utils/markdown";
import { IconAttach, IconBack, IconSend } from "../components/Icons";
import MediaPanel from "../components/MediaPanel";
import ChatMessageRow from "../components/ChatMessageRow";
import ChannelPanel from "../components/ChannelPanel";
import ChatSettingsPanel from "../components/ChatSettingsPanel";
import ChatToolsModal from "../components/ChatToolsModal";
import GroupInfoPanel from "../components/GroupInfoPanel";
import CatchUpBanner from "../components/CatchUpBanner";
import ImageViewer, { type ImageViewerItem } from "../components/ImageViewer";
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
  if (isImageMessage(message) && url) {
    return null;
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
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [channelPanelOpen, setChannelPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState<number | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerItem | null>(null);
  const [msgMenu, setMsgMenu] = useState<{ messageId: number; x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    connectWebSocket();
    Promise.all([fetchMe(), fetchConversation(conversationId), fetchMessages(conversationId)])
      .then(async ([profile, chat, initialMessages]) => {
        setMe(profile);
        setConversation(chat);
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
    if (reactionPickerId === null) return;
    function close(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest(".reaction-picker-float") || target.closest(".bubble-wrap.picker-open")) {
        return;
      }
      setReactionPickerId(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [reactionPickerId]);

  useEffect(() => {
    if (!loading && !editingMessage) inputRef.current?.focus();
  }, [loading, conversationId, editingMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

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
    setGroupInfoOpen(false);
    const label =
      conversation?.type === "group"
        ? "Delete this group? It will be removed from your chat list."
        : conversation?.type === "channel"
          ? "Leave this channel? It will be removed from your chat list."
          : "Delete this chat? It will be removed from your chat list.";
    if (!window.confirm(label)) return;
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

  function openImageViewer(message: ChatMessage) {
    const url = resolveAttachmentUrl(message);
    if (!url) return;
    setImageViewer({
      messageId: message.id,
      url,
      fileName: message.file_name || "photo.jpg",
      senderName: message.sender.username,
      createdAt: formatMessageTime(message.created_at),
      reactions: message.reactions ?? [],
    });
    setReactionPickerId(null);
  }

  function openMessageMenu(message: ChatMessage, x: number, y: number) {
    setReactionPickerId(null);
    setMsgMenu({ messageId: message.id, ...clampMenuPosition(x, y) });
  }

  async function openThread(message: ChatMessage) {
    setActiveThread(message);
    const replies = await fetchThreadMessages(conversationId, message.id);
    setThreadMessages(replies);
  }

  const isGroup = conversation?.type === "group";
  const isChannel = conversation?.type === "channel";
  const isDirect = conversation?.type === "direct";
  const chatTitle = conversation ? titleFor(conversation) : loading ? "…" : "Chat";
  const isAdmin = Boolean(
    conversation?.members.some((m) => m.user.id === me?.id && m.role === "admin") || false,
  );
  const avatarSeed =
    isGroup || isChannel
      ? conversation?.name || String(conversation?.id ?? conversationId)
      : conversation?.other_user?.username ?? chatTitle;

  function openGroupInfo() {
    if (!conversation) return;
    if (isDirect) return;
    setGroupInfoOpen(true);
    setMenuOpen(false);
  }

  function openMediaFromMenu() {
    setMenuOpen(false);
    setGroupInfoOpen(false);
    void openMediaPanel();
  }
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
        <button
          type="button"
          className={`chat-topbar-profile ${!isDirect ? "clickable" : ""}`}
          onClick={openGroupInfo}
          disabled={isDirect || !conversation}
        >
          <div
            className={`avatar sm ${conversation?.other_user?.is_online ? "" : "light-border"}`}
            style={{ background: avatarColor(avatarSeed) }}
          >
            {initials(chatTitle)}
            {isDirect && conversation?.other_user?.is_online ? (
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
        </button>
        <div className="chat-topbar-menu" ref={menuRef}>
          <button
            className="btn icon-btn ghost topbar-menu-btn"
            type="button"
            aria-label="Chat menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            ⋮
          </button>
          {menuOpen ? (
            <div className="dropdown-menu">
              <button type="button" onClick={openMediaFromMenu}>
                View media
              </button>
              {isGroup || isChannel ? (
                <button type="button" onClick={openGroupInfo}>
                  {isGroup ? "Group info" : "Channel info"}
                </button>
              ) : null}
              {isChannel ? (
                <button type="button" onClick={() => { setMenuOpen(false); setChannelPanelOpen(true); }}>
                  Channel panel
                </button>
              ) : null}
              {!isGroup && !isChannel ? (
                <>
                  <button type="button" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                    Notifications & DND
                  </button>
                  <button type="button" onClick={() => { setMenuOpen(false); setToolsOpen(true); }}>
                    Polls & schedule
                  </button>
                </>
              ) : null}
              <button type="button" className="danger" onClick={handleDeleteChat}>
                {isGroup ? "Delete group" : isChannel ? "Leave channel" : "Delete chat"}
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
          displayMessages.map((message, index) => (
            <ChatMessageRow
              key={message.id}
              message={message}
              index={index}
              displayMessages={displayMessages}
              conversation={conversation}
              me={me}
              activeThread={Boolean(activeThread)}
              expectedReaders={expectedReaders}
              reactionPickerId={reactionPickerId}
              onOpenReactionPicker={setReactionPickerId}
              onCloseReactionPicker={() => setReactionPickerId(null)}
              onReactionsUpdate={(messageId, reactions) =>
                setMessages((prev) =>
                  prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
                )
              }
              onMessageUpdated={(updated) =>
                setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
              }
              onOpenImage={openImageViewer}
              onOpenThread={openThread}
              onContextMenu={openMessageMenu}
              renderContent={messageContent}
            />
          ))
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
          {activeMenuMessage.sender.id === me?.id ? (
            <button type="button" className="danger" onClick={() => handleDeleteMessage(activeMenuMessage.id)}>
              Delete
            </button>
          ) : null}
          {isImageMessage(activeMenuMessage) ? (
            <button type="button" onClick={() => { openImageViewer(activeMenuMessage); setMsgMenu(null); }}>
              View photo
            </button>
          ) : null}
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

      {groupInfoOpen && conversation && !isDirect ? (
        <GroupInfoPanel
          conversation={conversation}
          me={me}
          onClose={() => setGroupInfoOpen(false)}
          onViewMedia={openMediaFromMenu}
          onDeleteGroup={handleDeleteChat}
        />
      ) : null}

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

      <ImageViewer
        item={imageViewer}
        onClose={() => setImageViewer(null)}
        onReactionsUpdate={(messageId, reactions) =>
          setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)))
        }
      />
    </div>
  );
}
