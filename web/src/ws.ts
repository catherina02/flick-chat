import type { WsEvent } from "./types";
import { getWsUrl } from "./api";

type Listener = (event: WsEvent) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, 3000);
}

export function connectWebSocket() {
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    return;
  }

  socket = new WebSocket(getWsUrl());

  socket.onopen = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  socket.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as WsEvent;
      listeners.forEach((listener) => listener(event));
    } catch {
      // ignore malformed payloads
    }
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };
}

export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function send(payload: Record<string, unknown>) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

export function joinConversation(conversationId: number) {
  send({ type: "conversation.join", conversation_id: conversationId });
}

export function sendChatMessage(conversationId: number, body: string) {
  send({ type: "message.send", conversation_id: conversationId, body });
}

export function sendTyping(conversationId: number, isTyping: boolean) {
  send({
    type: isTyping ? "typing.start" : "typing.stop",
    conversation_id: conversationId,
  });
}

export function markRead(conversationId: number) {
  send({ type: "message.read", conversation_id: conversationId });
}
