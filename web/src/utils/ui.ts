export function avatarColor(seed: string | number): string {
  const colors = [
    "#6366f1",
    "#0ea5e9",
    "#14b8a6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
  ];
  const value = typeof seed === "number" ? seed : seed.charCodeAt(0) + seed.length;
  return colors[Math.abs(value) % colors.length];
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (sameDay) {
    return formatMessageTime(iso);
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}
