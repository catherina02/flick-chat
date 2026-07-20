export type User = {
  id: number;
  username: string;
  email: string;
  is_online: boolean;
};

export type ChatMessage = {
  id: number;
  conversation: number;
  sender: User;
  message_type: "text" | "image" | "file";
  body: string;
  attachment_url: string | null;
  file_name: string;
  file_size: number;
  created_at: string;
  read_by: number[];
};

export type Conversation = {
  id: number;
  type: "direct" | "group";
  name: string;
  members: { user: User; joined_at: string }[];
  other_user: User | null;
  last_message: ChatMessage | null;
  updated_at: string;
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
