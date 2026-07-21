import type { ChatMessage, User } from "../types";

export type NotificationPrefs = {
  dnd_enabled: boolean;
  work_hours_start: string | null;
  work_hours_end: string | null;
};

export type ConversationSettings = {
  notification_level: "all" | "mentions" | "mute";
  is_locked: boolean;
  canvas_body: string;
  role: string;
};

export type CatchUpSummary = {
  since: string;
  message_count: number;
  highlights: ChatMessage[];
  summary: string;
};

export type WebhookConfig = {
  id: number;
  name: string;
  url: string;
  secret: string;
  direction: "incoming" | "outgoing";
  events: string[];
  conversation: number | null;
  is_active: boolean;
  created_at: string;
};

export type ScheduledMessageItem = {
  id: number;
  body: string;
  scheduled_at: string;
  is_urgent: boolean;
  delivered: boolean;
  created_at: string;
};

export type PollCardData = {
  question: string;
  options: string[];
  votes: Record<string, number[]>;
};

export type ApprovalCardData = {
  title: string;
  required?: number;
  approvals: number[];
  rejections: number[];
  status: "pending" | "approved" | "rejected";
};

export type CardMessage = ChatMessage & {
  message_type: "card";
  card_type: "poll" | "approval";
  card_data: PollCardData | ApprovalCardData;
};

export function isCardMessage(message: ChatMessage): message is CardMessage {
  return message.message_type === "card" && Boolean(message.card_type);
}

export type AuditLogEntry = {
  id: number;
  actor: User | null;
  action: string;
  target_type: string;
  target_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
