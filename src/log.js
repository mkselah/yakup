// Phase 5.3: tiny logger. Prints to the console AND appends to data/log.txt.
// When log.txt passes ~1 MB it is moved to log.old.txt (the previous old file is deleted),
// so logs never grow beyond about 2 MB in total.
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
const DIR = new URL("../data/", import.meta.url);
const FILE = new URL("../data/log.txt", import.meta.url);
const OLD = new URL("../data/log.old.txt", import.meta.url);
const MAX_BYTES = 1_000_000;
// "2026-11-15 21:00:00" in Danish time, whatever the tablet's own time zone is set to.
function timestamp() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" });
}
function rotateIfNeeded() {
  try {
    if (statSync(FILE).size < MAX_BYTES) return;
  } catch {
    return; // file doesn't exist yet
  }
  rmSync(OLD, { force: true });
  renameSync(FILE, OLD);
}
// log("Too Great To Cancel", "ok found=19 new=0")   or   log("-", "started")
export function log(watcher, message) {
  const line = `${timestamp()} | ${watcher} | ${message}`;
  console.log(line);
  try {
    mkdirSync(DIR, { recursive: true });
    rotateIfNeeded();
    appendFileSync(FILE, line + "\n");
  } catch (err) {
    // Logging must never kill the loop.
    console.error(`(could not write log file: ${err.message})`);
  }
}