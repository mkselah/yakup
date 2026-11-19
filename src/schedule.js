// Fixed daily run times (Danish time) for a watcher, e.g. times: ["10:00", "14:00"].
// Returns a slot key like "2026-11-16 14:00" if a slot has passed today and has not
// been run yet, otherwise null. After a restart or power cut it catches up once.
const TZ = "Europe/Copenhagen";
export function dueSlot(w, ws) {
  const now = new Date().toLocaleString("sv-SE", { timeZone: TZ }); // "2026-11-16 14:03:12"
  const date = now.slice(0, 10);
  const time = now.slice(11, 16);
  const passed = [...w.times].sort().filter((t) => t <= time);
  if (passed.length === 0) return null;
  const key = `${date} ${passed[passed.length - 1]}`;
  return ws?.lastSlot === key ? null : key;
}