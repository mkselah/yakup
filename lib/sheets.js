import { GoogleAuth } from "google-auth-library";
const auth = new GoogleAuth({
  keyFile: process.env.GOOGLE_KEY_FILE || "./service-account.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
// Column headers the app writes to (created automatically if missing)
export const OUTPUT_COLUMNS = [
  "Price (DKK)",
  "Shop",
  "Link",
  "Matched product",
  "Confidence",
  "Updated",
];
// Tab where every price check is appended
export const HISTORY_TAB = "Price History";
const HISTORY_HEADER = [
  "Date",
  "Item",
  "Price (DKK)",
  "Shop",
  "Link",
  "Matched product",
  "Confidence",
  "Note",
  "Source tab",
];
// Header names recognised as "the item column"
const ITEM_HEADERS = ["item", "items", "product", "produkt", "vare", "varer", "name", "navn"];
async function api(url, method = "GET", data) {
  const client = await auth.getClient();
  try {
    const res = await client.request({ url, method, data });
    return res.data;
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    throw new Error(`Google Sheets: ${msg}`);
  }
}
// Accepts a full sheet URL or just the ID
export function parseSheetId(input) {
  const s = String(input || "").trim();
  const m = s.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}
function colLetter(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function quoteTab(tab) {
  return `'${String(tab).replace(/'/g, "''")}'`;
}
// "YYYY-MM-DD HH:MM:SS" in Danish time – Sheets reads this as a date
function nowStamp() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" });
}
// "YYYY-MM-DD" in Danish time
function todayStr() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}
// Sheets returns dates as serial numbers (days since 1899-12-30) → "YYYY-MM-DD HH:MM"
function serialToText(v) {
  if (typeof v !== "number") return String(v ?? "");
  return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 16).replace("T", " ");
}
export async function listTabs(sheetId) {
  const d = await api(`${BASE}/${sheetId}?fields=properties.title,sheets.properties.title`);
  return {
    title: d.properties.title,
    tabs: d.sheets.map((s) => s.properties.title).filter((t) => t !== HISTORY_TAB),
  };
}
export async function loadItems(sheetId, tab) {
  const range = encodeURIComponent(`${quoteTab(tab)}!A1:ZZ`);
  // Unformatted values: prices come back as numbers, dates as serial numbers
  const d = await api(
    `${BASE}/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`
  );
  const rows = d.values || [];
  if (!rows.length) return { itemHeader: null, columns: {}, items: [] };
  const header = rows[0].map((h) => String(h).trim());
  let itemCol = header.findIndex((h) => ITEM_HEADERS.includes(h.toLowerCase()));
  if (itemCol === -1) itemCol = 0;
  // Find or create output columns
  const columns = {};
  let headerChanged = false;
  for (const name of OUTPUT_COLUMNS) {
    let idx = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    if (idx === -1) {
      idx = header.length;
      header.push(name);
      headerChanged = true;
    }
    columns[name] = idx;
  }
  if (headerChanged) {
    const headerRange = encodeURIComponent(`${quoteTab(tab)}!A1`);
    await api(
      `${BASE}/${sheetId}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      "PUT",
      { values: [header] }
    );
  }
  const priceCol = columns["Price (DKK)"];
  const updCol = columns["Updated"];
  const today = todayStr();
  const items = rows
    .slice(1)
    .map((r, i) => {
      const updated = serialToText(r[updCol]);
      return {
        row: i + 2, // sheet row number (1 = header)
        name: String(r[itemCol] ?? "").trim(),
        price: r[priceCol] ?? "",
        updated,
        checkedToday: updated.startsWith(today),
      };
    })
    .filter((it) => it.name);
  return { itemHeader: header[itemCol] || "column A", columns, items };
}
// ---------- Price history ----------
// Cache per spreadsheet so we only check/create the tab once per server run
const historyReady = new Map();
function ensureHistoryTab(sheetId) {
  if (!historyReady.has(sheetId)) {
    const p = (async () => {
      const d = await api(`${BASE}/${sheetId}?fields=sheets.properties.title`);
      if (d.sheets.some((s) => s.properties.title === HISTORY_TAB)) return;
      await api(`${BASE}/${sheetId}:batchUpdate`, "POST", {
        requests: [
          {
            addSheet: {
              properties: { title: HISTORY_TAB, gridProperties: { frozenRowCount: 1 } },
            },
          },
        ],
      });
      const range = encodeURIComponent(`${quoteTab(HISTORY_TAB)}!A1`);
      await api(`${BASE}/${sheetId}/values/${range}?valueInputOption=RAW`, "PUT", {
        values: [HISTORY_HEADER],
      });
    })();
    p.catch(() => historyReady.delete(sheetId)); // retry next time if it failed
    historyReady.set(sheetId, p);
  }
  return historyReady.get(sheetId);
}
async function appendHistory(sheetId, row) {
  await ensureHistoryTab(sheetId);
  const range = encodeURIComponent(`${quoteTab(HISTORY_TAB)}!A1`);
  try {
    await api(
      `${BASE}/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      "POST",
      { values: [row] }
    );
  } catch (e) {
    historyReady.delete(sheetId); // e.g. tab was deleted – recreate next time
    throw e;
  }
}
// ---------- Write one result ----------
export async function writeResult(sheetId, tab, row, columns, result, item) {
  const found = typeof result.price === "number";
  const stamp = nowStamp();
  const values = {
    "Price (DKK)": found ? result.price : "",
    "Shop": found ? result.shop || "" : "Not found",
    "Link": result.url || "",
    "Matched product": result.matched_product || result.note || "",
    "Confidence": result.confidence || "",
    "Updated": stamp,
  };
  const data = Object.entries(values).map(([name, v]) => ({
    range: `${quoteTab(tab)}!${colLetter(columns[name])}${row}`,
    values: [[v]],
  }));
  // 1. Overwrite current price in the main tab
  await api(`${BASE}/${sheetId}/values:batchUpdate`, "POST", {
    valueInputOption: "USER_ENTERED",
    data,
  });
  // 2. Append to history
  await appendHistory(sheetId, [
    stamp,
    item || "",
    values["Price (DKK)"],
    values["Shop"],
    values["Link"],
    result.matched_product || "",
    values["Confidence"],
    result.note || "",
    tab,
  ]);
  return stamp;
}