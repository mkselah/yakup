// Appends every successful price check to data/prices.csv  (date,name,price,shop)
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
const DIR = new URL("../data/", import.meta.url);
const FILE = new URL("../data/prices.csv", import.meta.url);
function cell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function appendPrice(name, price, shop) {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(FILE)) appendFileSync(FILE, "date,name,price,shop\n");
  const date = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Copenhagen" });
  appendFileSync(FILE, [date, name, price, shop].map(cell).join(",") + "\n");
}