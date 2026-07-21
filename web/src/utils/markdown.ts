/** Lightweight markdown → HTML (bold, italic, code, links, lists). */
export function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
    )
    .replace(/\n/g, "<br />");
}

export function presenceLabel(status: string, custom?: string): string {
  if (custom?.trim()) return custom.trim();
  switch (status) {
    case "away":
      return "Away";
    case "busy":
      return "In a meeting";
    case "ooo":
      return "Out of office";
    default:
      return "Online";
  }
}
