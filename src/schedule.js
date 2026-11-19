// Scheduling helpers (all in Danish time).
//
// 1) dueSlot:     fixed daily run times for a watcher, e.g. times: ["10:00", "14:00"].
//    Returns a slot key like "2026-11-16 14:00" if a slot has passed today and has not
//    been run yet, otherwise null. After a restart or power cut it catches up once.
//
// 2) intervalFor: for interval watchers with an optional "schedule" block:
//      "schedule": {
//        "quiet": ["00:00", "07:00"],                      no checks in this period
//        "fast": [["08:30", "10:00"], ["14:30", "15:30"]], faster checks in these periods
//        "fastEveryMin": 10
//      }
//    Returns how many minutes to wait between checks right now, or null = quiet, don't run.
const TZ = "Europe/Copenhagen";
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function localNow() {
  return new Date().toLocaleString("sv-SE", { timeZone: TZ }); // "2026-11-16 14:03:12"
}
export function dueSlot(w, ws) {
  const now = localNow();
  const date = now.slice(0, 10);
  const time = now.slice(11, 16);
  const passed = [...w.times].sort().filter((t) => t <= time);
  if (passed.length === 0) return null;
  const key = `${date} ${passed[passed.length - 1]}`;
  return ws?.lastSlot === key ? null : key;
}
// start <= t < end. Also works across midnight, e.g. ["22:00", "06:00"].
function inRange(t, start, end) {
  return start <= end ? t >= start && t < end : t >= start || t < end;
}
export function intervalFor(w, baseMin) {
  const s = w.schedule;
  if (!s) return baseMin;
  const t = localNow().slice(11, 16);
  if (s.quiet && inRange(t, s.quiet[0], s.quiet[1])) return null;
  const fast = s.fast ?? [];
  if (fast.some(([a, b]) => inRange(t, a, b))) return s.fastEveryMin ?? 10;
  return baseMin;
}
// Throws a readable error if the "schedule" block in watchers.json is wrong.
export function validateSchedule(name, s) {
  const bad = (msg) => {
    throw new Error(`watchers.json "${name}": schedule ${msg}`);
  };
  if (typeof s !== "object" || s === null || Array.isArray(s)) bad("must be an object { ... }");
  const isPair = (p) => Array.isArray(p) && p.length === 2 && p.every((x) => TIME_RE.test(x));
  if (s.quiet != null && !isPair(s.quiet)) bad('"quiet" must look like ["00:00","07:00"]');
  if (s.fast != null && !(Array.isArray(s.fast) && s.fast.every(isPair))) {
    bad('"fast" must look like [["08:30","10:00"],["14:30","15:30"]]');
  }
  if (s.fastEveryMin != null && !(Number(s.fastEveryMin) >= 1)) {
    bad('"fastEveryMin" must be a number of minutes, 1 or more');
  }
}