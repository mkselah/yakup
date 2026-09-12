export async function handler(event, context) {
  // REPLACE with your sheet ID:
  const SHEET_ID = '1U2ZmiGJfotFVYGRGytANJosiWQJHJcMSSoMzP4DUU4Q';
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error(`Fetch error: ${resp.status}`);
    const csv = await resp.text();
    console.log("CSV fetched:", csv);
    const rows = parseCSV(csv);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || "Unknown error" }),
    };
  }
}
// ---- Robust CSV parser ----
// Handles: quoted fields, commas inside quotes, escaped quotes (""),
// and \r\n or \n line endings. Returns array of objects keyed by header row.
function parseCSV(csvText) {
  // Normalize line endings first
  const text = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = "";
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }
  // push last field/row if file doesn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Remove any fully empty trailing rows (e.g. blank line at end of sheet)
  while (rows.length && rows[rows.length - 1].every(c => c.trim() === "")) {
    rows.pop();
  }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cols[i] !== undefined ? cols[i] : "").trim();
    });
    return obj;
  });
}