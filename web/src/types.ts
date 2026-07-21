export type PresenceStatus = "online" | "away" | "busy" | "ooo";

export type User = {
  id: number;
  username: string;
  email: string;
  is_online: boolean;
  presence_status: PresenceStatus;
  status_message: string;
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type ChatMessage = {
  id: number;
  conversation: number;
  parent_id: number | null;
  sender: User;
  message_type: "text" | "image" | "file" | "audio" | "card";
  body: string;
  attachment_url: string | null;
  file_name: string;
  file_size: number;
  is_deleted: boolean;
  is_pinned: boolean;
  is_urgent: boolean;
  card_type?: "poll" | "approval" | "";
  card_data?: Record<string, unknown>;
  transcript?: string;
  edited_at: string | null;
  created_at: string;
  read_by: number[];
  reactions: ReactionSummary[];
  reply_count: number;
  conversation_name?: string;
};

export type Conversation = {
  id: number;
  type: "direct" | "group" | "channel";
  name: string;
  description: string;
  is_public: boolean;
  is_locked?: boolean;
  canvas_body?: string;
  members: { user: User; role: string; joined_at: string }[];
  other_user: User | null;
  last_message: ChatMessage | null;
  updated_at: string;
};

export type ChannelResource = {
  id: number;
  title: string;
  url: string;
  body: string;
  created_by: User;
  created_at: string;
};

export type AppNotification = {
  id: number;
  notification_type: "message" | "group";
  title: string;
  body: string;
  conversation: number | null;
  message: number | null;
  is_read: boolean;
  created_at: string;
};

export type WsEvent = Record<string, unknown>;
