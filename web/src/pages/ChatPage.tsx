import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchConversations,
  fetchMe,
  fetchMessages,
  markConversationRead,
  messageAttachmentUrl,
  uploadFile,
} from "../api";
import type { ChatMessage, Conversation, User } from "../types";
import { avatarColor, formatDateSeparator, formatMessageTime, initials, isSameDay } from "../utils/ui";
import { IconAttach, IconBack, IconSend } from "../components/Icons";
import {
  connectWebSocket,
  joinConversation,
  markRead,
  sendChatMessage,
  sendTyping,
  subscribe,
} from "../ws";

function titleFor(conversation: Conversation | undefined) {
  if (!conversation) return "Chat";
  if (conversation.type === "group") return conversation.name || "Group Chat";
  return conversation.other_user?.username ?? "Chat";
}

function subtitleFor(conversation: Conversation | undefined) {
  if (!conversation) return "";
  if (conversation.type === "group") {
    const count = conversation.members.length;
    return `${count} member${count === 1 ? "" : "s"}`;
  }
  if (conversation.other_user?.is_online) return "online";
  return "last seen recently";
}

function resolveAttachmentUrl(message: ChatMessage): string | null {
  if (message.message_type === "text") return null;
  if (message.attachment_url?.includes("token=")) return message.attachment_url;
  return messageAttachmentUrl(message.id);
}

function messageContent(message: ChatMessage) {
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

  return <span className="bubble-text">{message.body}</span>;
}

export default function ChatPage() {
  const { id } = useParams();
  const conversationId = Number(id);
  const [me, setMe] = useState<User | null>(null);
  const [conversation, setConversation] = useState<Conversation | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      if (event.type === "message.new" && event.conversation_id === conversationId) {
        setMessages((prev) => {
          const exists = prev.some((item) => item.id === event.id);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: event.id as number,
              conversation: conversationId,
              sender: {
                id: event.sender_id as number,
                username: event.sender as string,
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
            },
          ];
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
    if (!loading) inputRef.current?.focus();
  }, [loading, conversationId]);

  const expectedReaders = useMemo(() => {
    if (!conversation) return 1;
    const count = conversation.members.length || (conversation.type === "group" ? 0 : 2);
    return count > 0 ? count - 1 : 1;
  }, [conversation]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    sendTyping(conversationId, false);
    sendChatMessage(conversationId, body);
    setText("");
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

  const chatTitle = titleFor(conversation);
  const avatarSeed =
    conversation?.type === "group"
      ? conversation.name || String(conversation.id)
      : conversation?.other_user?.username ?? chatTitle;

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
      </div>

      <div className="messages">
        {loading ? (
          <div className="loading-messages">
            <div className="spinner" />
            <p className="meta">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">
              <IconSend size={28} />
            </div>
            <h2>No messages yet</h2>
            <p>Say hello and start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isMe = message.sender.id === me?.id;
            const prev = messages[index - 1];
            const next = messages[index + 1];
            const showDate =
              !prev || !isSameDay(prev.created_at, message.created_at);
            const isGrouped =
              prev &&
              prev.sender.id === message.sender.id &&
              isSameDay(prev.created_at, message.created_at);
            const nextGrouped =
              next &&
              next.sender.id === message.sender.id &&
              isSameDay(next.created_at, message.created_at);
            const isRead = isMe && message.read_by.length >= expectedReaders;
            const receipt = isMe ? (isRead ? "✓✓" : "✓") : "";
            const showSender =
              !isMe && conversation?.type === "group" && !isGrouped;

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
                    <div className={`bubble ${isMe ? "me" : ""} ${isGrouped || nextGrouped ? "grouped-bubble" : ""}`}>
                      {messageContent(message)}
                      <span className="bubble-meta">
                        {formatMessageTime(message.created_at)}
                        {receipt ? <span className="receipt">{receipt}</span> : null}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*,.pdf,.txt,.zip,.doc,.docx"
          onChange={onFileSelected}
        />
        <button
          className="attach-btn"
          type="button"
          disabled={uploading || loading}
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          <IconAttach />
        </button>
        <div className="composer-input-wrap">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sendTyping(conversationId, e.target.value.trim().length > 0);
            }}
            placeholder="Type a message"
            disabled={loading}
          />
        </div>
        <button className="send-btn" type="submit" disabled={!text.trim() || loading} aria-label="Send">
          <IconSend />
        </button>
      </form>
    </div>
  );
}
