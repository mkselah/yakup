// Entry point.
//   npm run check  -> run all watchers once (ignores schedules) and print the results
//   npm start      -> forever: interval watchers every CHECK_INTERVAL_MIN minutes,
//                     price watchers at their fixed "times" (default 10:00 and 14:00)
// Load .env if it exists (Node 20.12+). No dependency needed.
try {
  process.loadEnvFile();
} catch {}
import { readFileSync } from "node:fs";
import { runWatcher } from "./check.js";
import { loadState } from "./state.js";
import { dueSlot } from "./schedule.js";
import { log } from "./log.js";
const once = process.argv.includes("--once");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TICK_MS = 60_000; // how often the loop checks "is anything due?"
const DEFAULT_TIMES = ["10:00", "14:00"];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const nextRunAt = new Map(); // watcher name -> timestamp (interval watchers only)
let lastConfigError = null;
// ---------- config ----------
// Read from disk every tick, so edits to watchers.json apply without a restart.
function loadWatchers() {
  const file = new URL("../watchers.json", import.meta.url);
  let list;
  try {
    list = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`watchers.json unreadable: ${err.message}`);
  }
  if (!Array.isArray(list)) throw new Error("watchers.json must be a list [ ... ]");
  const names = new Set();
  for (const [i, w] of list.entries()) {
    for (const key of ["name", "type", "url"]) {
      if (!w || typeof w[key] !== "string" || !w[key].trim()) {
        throw new Error(`watchers.json entry #${i + 1}: missing "${key}"`);
      }
    }
    if (names.has(w.name)) throw new Error(`watchers.json: duplicate name "${w.name}"`);
    names.add(w.name);
    if (w.type === "price") {
      if (!(Number(w.target) > 0)) {
        throw new Error(`watchers.json "${w.name}": "target" must be a number above 0`);
      }
      w.times ??= DEFAULT_TIMES;
      if (!Array.isArray(w.times) || w.times.length === 0 || !w.times.every((t) => TIME_RE.test(t))) {
        throw new Error(`watchers.json "${w.name}": "times" must look like ["10:00","14:00"]`);
      }
    }
  }
  return list.filter((w) => w.enabled !== false); // "enabled": false skips an entry
}
function intervalMinutes() {
  const n = Number(process.env.CHECK_INTERVAL_MIN);
  return Number.isFinite(n) && n >= 1 ? n : 60;
}
// Interval + random jitter (0..10% of the interval, max 5 min), so we don't hit the site on the exact minute.
function nextDelayMs() {
  const base = intervalMinutes() * 60_000;
  const jitter = Math.random() * Math.min(base * 0.1, 5 * 60_000);
  return Math.round(base + jitter);
}
// ---------- output for `npm run check` ----------
function printPostings(items) {
  for (const it of items) {
    const status = it.soldOut ? "SOLD OUT " : "AVAILABLE";
    const price = it.price != null ? `${it.price} kr` : "no price";
    const was = it.oldPrice != null ? ` (was ${it.oldPrice})` : "";
    console.log(
      `[${status}] ${it.departDate ?? "?"} | ${it.destination ?? it.title} | ${price}${was} | id ${it.id}`
    );
  }
  const available = items.filter((i) => !i.soldOut).length;
  console.log(
    `-> ${items.length} postings, ${available} available, ${items.length - available} sold out`
  );
}
function printOffers(offers) {
  for (const o of offers) {
    console.log(`${String(o.price).padStart(7)} kr | ${o.shop} (${o.source})`);
  }
  console.log(`-> ${offers.length} offers, cheapest ${offers[0].price} kr at ${offers[0].shop}`);
}
// ---------- one pass over all watchers (never throws) ----------
// force = true (npm run check): run everything now, ignore schedules.
async function runCycle(printList, force) {
  let watchers;
  try {
    watchers = loadWatchers();
    lastConfigError = null;
  } catch (err) {
    if (err.message !== lastConfigError) {
      lastConfigError = err.message; // log each config problem once, not every minute
      log("-", `CONFIG ERROR ${err.message}`);
    }
    return;
  }
  let state = null;
  let ranAny = false;
  for (const w of watchers) {
    let slot = null;
    if (!force) {
      if (w.times) {
        state ??= loadState();
        slot = dueSlot(w, state.watchers[w.name]);
        if (!slot) continue;
      } else if (Date.now() < (nextRunAt.get(w.name) ?? 0)) {
        continue;
      }
    }
    // small pause between different sites
    if (ranAny) await sleep(2000 + Math.random() * 3000);
    ranAny = true;
    console.log(`\n=== ${w.name} (${w.url}) ===`);
    try {
      const result = await runWatcher(w, { slot });
      if (result.ok) {
        if (printList) {
          if (result.type === "price") printOffers(result.items);
          else printPostings(result.items);
        }
        log(w.name, `ok ${result.summary}`);
      } else {
        log(w.name, `FAILED ${result.error}`);
      }
    } catch (err) {
      log(w.name, `ERROR ${err.message}`);
    }
    if (!w.times) nextRunAt.set(w.name, Date.now() + nextDelayMs());
  }
}
// ---------- forever loop ----------
async function loop() {
  log("-", `started: interval watchers every ${intervalMinutes()} min (+ jitter), price watchers at their set times`);
  while (true) {
    try {
      await runCycle(false, false);
    } catch (err) {
      log("-", `CYCLE ERROR ${err.message}`); // should not happen, but the loop must survive
    }
    await sleep(TICK_MS);
  }
}
// A stray error anywhere must not kill the process.
process.on("unhandledRejection", (err) => log("-", `UNHANDLED REJECTION ${err?.message ?? err}`));
process.on("uncaughtException", (err) => log("-", `UNCAUGHT EXCEPTION ${err?.message ?? err}`));
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("-", `stopped (${sig})`);
    process.exit(0);
  });
}
if (once) {
  await runCycle(true, true);
} else {
  await loop();
}