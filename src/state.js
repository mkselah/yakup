// Phase 4: read/write data/state.json (atomic write, so power loss can't corrupt it).
//
// Shape:
// {
//   "watchers": {
//     "Too Great To Cancel": {
//       "seeded": true,
//       "failures": 0,
//       "alerted": false,
//       "seen": { "<id>": { "firstSeen": "...", "lastSeen": "...", "title": "..." } }
//     }
//   }
// }
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
const DIR = new URL("../data/", import.meta.url);
const FILE = new URL("../data/state.json", import.meta.url);
const TMP = new URL("../data/state.json.tmp", import.meta.url);
const PRUNE_DAYS = 90;
export function loadState() {
  if (!existsSync(FILE)) return { watchers: {} };
  try {
    const state = JSON.parse(readFileSync(FILE, "utf8"));
    if (!state || typeof state.watchers !== "object") throw new Error("bad shape");
    return state;
  } catch (err) {
    // Corrupt file: keep a copy and start fresh (watchers will re-seed silently).
    const backup = new URL(`../data/state.corrupt-${Date.now()}.json`, import.meta.url);
    try {
      renameSync(FILE, backup);
    } catch {}
    console.error(`state.json was unreadable (${err.message}); moved aside, starting fresh`);
    return { watchers: {} };
  }
}
export function saveState(state) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(TMP, JSON.stringify(state, null, 2));
  renameSync(TMP, FILE); // atomic replace
}
// Remove seen entries not seen on the page for more than PRUNE_DAYS.
export function pruneSeen(ws) {
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const [id, rec] of Object.entries(ws.seen)) {
    const last = Date.parse(rec.lastSeen || rec.firstSeen || 0);
    if (!Number.isFinite(last) || last < cutoff) {
      delete ws.seen[id];
      removed++;
    }
  }
  return removed;
}