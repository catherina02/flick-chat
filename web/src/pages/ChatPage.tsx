import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchConversations,
  fetchMe,
  fetchMessages,
  markConversationRead,
  uploadFile,
} from "../api";
import type { ChatMessage, Conversation, User } from "../types";
import { avatarColor, formatMessageTime, initials } from "../utils/ui";
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

function messageContent(message: ChatMessage) {
  if (message.message_type === "image" && message.attachment_url) {
    return (
      <a href={message.attachment_url} target="_blank" rel="noreferrer">
        <img src={message.attachment_url} alt={message.file_name || "Image"} className="chat-image" />
      </a>
    );
  }

  if (message.message_type === "file" && message.attachment_url) {
    return (
      <a href={message.attachment_url} target="_blank" rel="noreferrer" className="file-link">
        📎 {message.file_name || "Download file"}
      </a>
    );
  }

  return message.body;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
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
      .catch(console.error);

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
          ←
        </Link>
        <div className="avatar sm" style={{ background: avatarColor(avatarSeed) }}>
          {initials(chatTitle)}
        </div>
        <div className="chat-topbar-info">
          <h2>{chatTitle}</h2>
          {typingUser ? (
            <p className="typing">{typingUser} is typing...</p>
          ) : (
            <p>{subtitleFor(conversation)}</p>
          )}
        </div>
      </div>

      <div className="messages">
        {messages.map((message) => {
          const isMe = message.sender.id === me?.id;
          const isRead = isMe && message.read_by.length >= expectedReaders;
          const receipt = isMe ? (isRead ? "✓✓" : "✓") : "";
          return (
            <div key={message.id} className={`bubble-row ${isMe ? "me" : ""}`}>
              <div className="bubble-wrap">
                {!isMe && conversation?.type === "group" ? (
                  <p className="sender-name">{message.sender.username}</p>
                ) : null}
                <div className={`bubble ${isMe ? "me" : ""}`}>{messageContent(message)}</div>
                <div className="bubble-footer">
                  <span>{formatMessageTime(message.created_at)}</span>
                  {receipt ? <span className="receipt">{receipt}</span> : null}
                </div>
              </div>
            </div>
          );
        })}
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
          className="btn icon-btn secondary"
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="Attach file"
        >
          {uploading ? "…" : "📎"}
        </button>
        <div className="composer-input-wrap">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sendTyping(conversationId, e.target.value.trim().length > 0);
            }}
            placeholder="Type a message"
          />
        </div>
        <button className="send-btn" type="submit" disabled={!text.trim()} aria-label="Send">
          ➤
        </button>
      </form>
    </div>
  );
}
