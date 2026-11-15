// Entry point.
//   npm run check  -> run all watchers once and print the postings
//   npm start      -> run now, then every CHECK_INTERVAL_MIN minutes, forever
// Load .env if it exists (Node 20.12+). No dependency needed.
try {
  process.loadEnvFile();
} catch {}
import { readFileSync } from "node:fs";
import { runWatcher } from "./check.js";
import { log } from "./log.js";
const once = process.argv.includes("--once");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ---------- config ----------
// Read from disk every cycle, so edits to watchers.json apply without a restart.
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
// ---------- one pass over all watchers (never throws) ----------
async function runCycle(printList) {
  let watchers;
  try {
    watchers = loadWatchers();
  } catch (err) {
    log("-", `CONFIG ERROR ${err.message}`);
    return;
  }
  for (let i = 0; i < watchers.length; i++) {
    const w = watchers[i];
    console.log(`\n=== ${w.name} (${w.url}) ===`);
    try {
      const result = await runWatcher(w);
      if (result.ok) {
        if (printList) printPostings(result.items);
        log(w.name, `ok found=${result.items.length} new=${result.newCount}`);
      } else {
        log(w.name, `FAILED ${result.error}`);
      }
    } catch (err) {
      log(w.name, `ERROR ${err.message}`);
    }
    // small pause between different sites
    if (i < watchers.length - 1) await sleep(2000 + Math.random() * 3000);
  }
}
// ---------- forever loop ----------
async function loop() {
  log("-", `started, checking every ${intervalMinutes()} min (+ jitter)`);
  while (true) {
    try {
      await runCycle(false);
    } catch (err) {
      log("-", `CYCLE ERROR ${err.message}`); // should not happen, but the loop must survive
    }
    const wait = nextDelayMs();
    log("-", `next check in ${(wait / 60_000).toFixed(1)} min`);
    await sleep(wait);
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
  await runCycle(true);
} else {
  await loop();
}