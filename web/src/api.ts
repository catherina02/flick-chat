const API_BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

type TokenPair = { access: string; refresh: string };

const ACCESS_KEY = "flick_access";
const REFRESH_KEY = "flick_refresh";

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

/** Build authenticated URL for a message attachment stored in the database. */
export function messageAttachmentUrl(messageId: number): string {
  const token = getAccessToken();
  const base = `${API_BASE}/api/v1/chat/messages/${messageId}/attachment/`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: TokenPair) {
  localStorage.setItem(ACCESS_KEY, tokens.access);
  localStorage.setItem(REFRESH_KEY, tokens.refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE}/api/v1/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error("Session expired");
  }

  const data = (await response.json()) as TokenPair & { access: string };
  setTokens({ access: data.access, refresh: data.refresh ?? refresh });
  return data.access;
}

async function authorizedFetch(path: string, init: RequestInit = {}) {
  let access = getAccessToken();
  if (!access) throw new Error("Not authenticated");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${access}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401) {
    access = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${access}`);
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return response;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${API_BASE}/api/v1/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Invalid email or password");
  const tokens = (await response.json()) as TokenPair;
  setTokens(tokens);
}

export async function register(
  username: string,
  email: string,
  password: string,
) {
  const response = await fetch(`${API_BASE}/api/v1/auth/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email,
      password,
      password_confirm: password,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(JSON.stringify(body));
  }
  await login(email, password);
}

export async function logout() {
  const refresh = getRefreshToken();
  const access = getAccessToken();
  if (access && refresh) {
    await fetch(`${API_BASE}/api/v1/auth/logout/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh }),
    }).catch(() => undefined);
  }
  clearTokens();
}

export async function fetchMe() {
  const response = await authorizedFetch("/api/v1/auth/me/");
  return response.json();
}

export async function fetchUsers() {
  const response = await authorizedFetch("/api/v1/chat/users/");
  return response.json();
}

export async function fetchConversations() {
  const response = await authorizedFetch("/api/v1/chat/conversations/");
  return response.json();
}

export async function createDirectChat(userId: number) {
  const response = await authorizedFetch("/api/v1/chat/conversations/direct/", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
  return response.json();
}

export async function createGroupChat(name: string, memberIds: number[]) {
  const response = await authorizedFetch("/api/v1/chat/conversations/group/", {
    method: "POST",
    body: JSON.stringify({ name, member_ids: memberIds }),
  });
  return response.json();
}

export async function createChannel(
  name: string,
  description: string,
  isPublic: boolean,
  memberIds: number[] = [],
) {
  const response = await authorizedFetch("/api/v1/chat/conversations/channel/", {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      is_public: isPublic,
      member_ids: memberIds,
    }),
  });
  return response.json();
}

export async function fetchPublicChannels() {
  const response = await authorizedFetch("/api/v1/chat/channels/public/");
  return response.json();
}

export async function joinChannel(conversationId: number) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/join/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.json();
}

export async function searchMessages(query: string) {
  const response = await authorizedFetch(
    `/api/v1/chat/search/?q=${encodeURIComponent(query)}`,
  );
  return response.json();
}

export async function updateStatus(data: {
  presence_status?: string;
  status_message?: string;
}) {
  const response = await authorizedFetch("/api/v1/auth/status/", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function toggleReaction(messageId: number, emoji: string) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/reactions/`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
  return response.json();
}

export async function pinMessage(messageId: number) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/pin/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return response.json();
}

export async function fetchThreadMessages(conversationId: number, threadId: number) {
  const response = await authorizedFetch(
    `/api/v1/chat/conversations/${conversationId}/messages/?thread=${threadId}`,
  );
  return response.json();
}

export async function fetchChannelResources(conversationId: number) {
  const response = await authorizedFetch(
    `/api/v1/chat/conversations/${conversationId}/resources/`,
  );
  return response.json();
}

export async function addChannelResource(
  conversationId: number,
  data: { title: string; url?: string; body?: string },
) {
  const response = await authorizedFetch(
    `/api/v1/chat/conversations/${conversationId}/resources/`,
    { method: "POST", body: JSON.stringify(data) },
  );
  return response.json();
}

export async function fetchMessages(conversationId: number) {
  const response = await authorizedFetch(
    `/api/v1/chat/conversations/${conversationId}/messages/`,
  );
  return response.json();
}

export async function fetchConversationMedia(conversationId: number) {
  const response = await authorizedFetch(
    `/api/v1/chat/conversations/${conversationId}/media/`,
  );
  return response.json();
}

export async function editMessage(messageId: number, body: string) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  return response.json();
}

export async function deleteMessage(messageId: number) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/delete/`, {
    method: "DELETE",
  });
  return response.json();
}

export async function deleteConversation(conversationId: number) {
  await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/`, {
    method: "DELETE",
  });
}

export async function markConversationRead(conversationId: number) {
  await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/read/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function uploadFile(conversationId: number, file: File, body = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (body.trim()) {
    formData.append("body", body.trim());
  }

  let access = getAccessToken();
  if (!access) throw new Error("Not authenticated");

  const headers = new Headers({ Authorization: `Bearer ${access}` });
  let response = await fetch(
    `${API_BASE}/api/v1/chat/conversations/${conversationId}/upload/`,
    { method: "POST", headers, body: formData },
  );

  if (response.status === 401) {
    access = await refreshAccessToken();
    headers.set("Authorization", `Bearer ${access}`);
    response = await fetch(
      `${API_BASE}/api/v1/chat/conversations/${conversationId}/upload/`,
      { method: "POST", headers, body: formData },
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed (${response.status})`);
  }

  return response.json();
}

export async function fetchNotifications() {
  const response = await authorizedFetch("/api/v1/chat/notifications/");
  return response.json();
}

export async function fetchUnreadNotificationCount() {
  const response = await authorizedFetch("/api/v1/chat/notifications/unread-count/");
  return response.json() as Promise<{ count: number }>;
}

export async function markNotificationRead(notificationId: number) {
  await authorizedFetch(`/api/v1/chat/notifications/${notificationId}/read/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function markAllNotificationsRead() {
  await authorizedFetch("/api/v1/chat/notifications/read-all/", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function registerDeviceToken(token: string, platform = "web") {
  await authorizedFetch("/api/v1/auth/device-token/", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

export async function fetchNotificationPrefs() {
  const response = await authorizedFetch("/api/v1/chat/preferences/notifications/");
  return response.json();
}

export async function updateNotificationPrefs(data: Record<string, unknown>) {
  const response = await authorizedFetch("/api/v1/chat/preferences/notifications/", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function fetchConversationSettings(conversationId: number) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/settings/`);
  return response.json();
}

export async function updateConversationSettings(conversationId: number, data: Record<string, unknown>) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/settings/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function fetchCatchUp(conversationId: number, since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/catchup/${qs}`);
  return response.json();
}

export async function createPoll(conversationId: number, question: string, options: string[]) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/cards/`, {
    method: "POST",
    body: JSON.stringify({ card_type: "poll", card_data: { question, options } }),
  });
  return response.json();
}

export async function createApproval(conversationId: number, title: string, required = 1) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/cards/`, {
    method: "POST",
    body: JSON.stringify({ card_type: "approval", card_data: { title, required } }),
  });
  return response.json();
}

export async function cardAction(messageId: number, data: Record<string, unknown>) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/card-action/`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function scheduleMessage(
  conversationId: number,
  body: string,
  scheduledAt: string,
  isUrgent = false,
) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/scheduled/`, {
    method: "POST",
    body: JSON.stringify({ body, scheduled_at: scheduledAt, is_urgent: isUrgent }),
  });
  return response.json();
}

export async function fetchScheduledMessages(conversationId: number) {
  const response = await authorizedFetch(`/api/v1/chat/conversations/${conversationId}/scheduled/`);
  return response.json();
}

export async function deleteScheduledMessage(scheduledId: number) {
  await authorizedFetch(`/api/v1/chat/scheduled/${scheduledId}/`, {
    method: "DELETE",
  });
}

export async function moderateDeleteMessage(messageId: number) {
  const response = await authorizedFetch(`/api/v1/chat/messages/${messageId}/moderate/`, {
    method: "DELETE",
  });
  return response.json();
}

export async function fetchWebhooks() {
  const response = await authorizedFetch("/api/v1/chat/webhooks/");
  return response.json();
}

export async function createWebhook(data: Record<string, unknown>) {
  const response = await authorizedFetch("/api/v1/chat/webhooks/", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.json();
}

export async function deleteWebhook(webhookId: number) {
  await authorizedFetch(`/api/v1/chat/webhooks/${webhookId}/`, { method: "DELETE" });
}

export async function loginWithGoogle(idToken: string) {
  const response = await fetch(`${API_BASE}/api/v1/auth/sso/google/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!response.ok) throw new Error("Google sign-in failed");
  const data = await response.json();
  setTokens({ access: data.access, refresh: data.refresh });
  return data.user;
}

export async function loginWithAzure(accessToken: string) {
  const response = await fetch(`${API_BASE}/api/v1/auth/sso/azure/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!response.ok) throw new Error("Azure sign-in failed");
  const data = await response.json();
  setTokens({ access: data.access, refresh: data.refresh });
  return data.user;
}

export function getWsUrl() {
  const wsBase = import.meta.env.VITE_WS_URL ?? API_BASE.replace(/^http/, "ws");
  const token = getAccessToken();
  return `${wsBase}/ws/chat/?token=${token ?? ""}`;
}

export { API_BASE };
