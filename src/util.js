// Small shared helpers.
// Danish price text -> number.
//   "13.120 kr" -> 13120    "1.299,00 kr." -> 1299    "795 kr." -> 795
//   "Fra 94 kr./md.¹" -> 94 (takes the FIRST number in the text)
const DK_NUMBER = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;
export function parseDkPrice(text) {
  if (text == null) return null;
  const m = String(text).match(DK_NUMBER);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
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