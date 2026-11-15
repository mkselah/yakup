// Small shared helpers.
// Danish price text -> number.  "13.120 kr" -> 13120,  "1.299,00 kr." -> 1299
export function parseDkPrice(text) {
  if (text == null) return null;
  const cleaned = String(text).replace(/[^\d,]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
// Number -> "13.120 kr"
export function formatKr(n) {
  if (n == null) return "no price";
  return `${Number(n).toLocaleString("da-DK")} kr`;
}
// Safe text for inserting into HTML mails.
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}