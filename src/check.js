// Runs one watcher: fetch -> compare with state -> mail new postings -> save state.
import { sendMail } from "./mail.js";
import { loadState, saveState, pruneSeen } from "./state.js";
import { fetchPostings } from "./watchers/postings.js";
import { escapeHtml, formatKr } from "./util.js";
const FAIL_ALERT_AFTER = 3; // consecutive failures before we mail an alert
// watcher type -> function(url) that returns an array of items with a stable `id`
const handlers = {
  postings: fetchPostings,
};
function buildDigest(w, items) {
  const rows = items
    .map((it) => {
      const was = it.oldPrice != null ? ` <s style="color:#888">${escapeHtml(formatKr(it.oldPrice))}</s>` : "";
      const bits = [
        it.tag ? `<em>${escapeHtml(it.tag)}</em>` : null,
        it.departDate ? `Departure: ${escapeHtml(it.departDate)}` : null,
        it.persons ? escapeHtml(it.persons) : null,
        it.duration ? escapeHtml(it.duration) : null,
      ].filter(Boolean);
      const img = it.image
        ? `<img src="${escapeHtml(it.image)}" width="240" style="border-radius:8px;display:block;margin-bottom:6px" alt="">`
        : "";
      return `
      <div style="margin:0 0 22px 0">
        ${img}
        <a href="${escapeHtml(it.url)}" style="font-size:16px;font-weight:bold">${escapeHtml(it.title)}</a><br>
        <span style="font-size:18px;color:#c20000"><b>${escapeHtml(formatKr(it.price))}</b></span>${was}<br>
        <span style="color:#555">${bits.join(" &middot; ")}</span>
      </div>`;
    })
    .join("");
  return `<h2>${escapeHtml(w.name)}: ${items.length} new</h2>${rows}
    <p style="color:#888;font-size:12px"><a href="${escapeHtml(w.url)}">${escapeHtml(w.url)}</a></p>`;
}
// Returns { ok, items, newCount, error }
export async function runWatcher(w) {
  const handler = handlers[w.type];
  if (!handler) throw new Error(`Unknown watcher type "${w.type}"`);
  const state = loadState();
  state.watchers[w.name] ??= { seeded: false, failures: 0, alerted: false, seen: {} };
  const ws = state.watchers[w.name];
  const now = new Date().toISOString();
  // ---- fetch (failure = never treat as "everything vanished") ----
  let items;
  try {
    items = await handler(w.url);
  } catch (err) {
    ws.failures += 1;
    ws.lastError = err.message;
    console.error(`FAILED (${ws.failures} in a row): ${err.message}`);
    if (ws.failures >= FAIL_ALERT_AFTER && !ws.alerted) {
      try {
        await sendMail(
          `Price watcher: "${w.name}" looks broken`,
          `<h3>Watcher broken</h3>
           <p><b>${escapeHtml(w.name)}</b> has failed ${ws.failures} times in a row.</p>
           <p>Last error: <code>${escapeHtml(err.message)}</code></p>
           <p>The layout may have changed, or the site is blocking us.</p>
           <p><a href="${escapeHtml(w.url)}">${escapeHtml(w.url)}</a></p>`
        );
        ws.alerted = true; // only once per incident
      } catch (mailErr) {
        console.error(`Could not send alert mail: ${mailErr.message}`);
      }
    }
    saveState(state);
    return { ok: false, items: [], newCount: 0, error: err.message };
  }
  // ---- success: reset failure tracking ----
  ws.failures = 0;
  ws.alerted = false;
  delete ws.lastError;
  // refresh lastSeen for everything still on the page
  for (const it of items) {
    if (ws.seen[it.id]) ws.seen[it.id].lastSeen = now;
  }
  const fresh = items.filter((it) => !ws.seen[it.id]);
  const mark = (it) => {
    ws.seen[it.id] = { firstSeen: now, lastSeen: now, title: it.title };
  };
  // ---- first run for this watcher: seed silently ----
  if (!ws.seeded) {
    fresh.forEach(mark);
    ws.seeded = true;
    saveState(state);
    console.log(`First run: saved ${fresh.length} postings as already seen (no mail).`);
    return { ok: true, items, newCount: 0 };
  }
  // ---- later runs: mail new, available postings ----
  const toMail = fresh.filter((it) => !it.soldOut);
  fresh.filter((it) => it.soldOut).forEach(mark); // new but already sold out: no mail
  let newCount = 0;
  if (toMail.length > 0) {
    try {
      await sendMail(
        `New: ${toMail.length} posting${toMail.length > 1 ? "s" : ""} on ${w.name}`,
        buildDigest(w, toMail)
      );
      toMail.forEach(mark); // only after the mail really went out
      newCount = toMail.length;
    } catch (err) {
      console.error(`Mail failed, will retry next run: ${err.message}`);
    }
  }
  const pruned = pruneSeen(ws);
  if (pruned) console.log(`Pruned ${pruned} old entries from state.`);
  saveState(state);
  console.log(`New postings mailed: ${newCount}`);
  return { ok: true, items, newCount };
}