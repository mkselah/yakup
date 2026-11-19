// Watcher type "price": reads a Pricerunner product page and returns all offers
// as [{ shop, price, source }], cheapest first.
//
// Sources, in order of preference:
//   1. "merchants": the merchant list embedded as JSON in the page (shop name + lowest price)
//   2. "text":      visible text on the page (shop names often unknown -> "?")
//   3. "jsonld":    schema.org data
//
// Optional in watchers.json:  "excludeShops": ["AI Eyewear"]
// (case-insensitive, matches if the shop name contains the text)
import * as cheerio from "cheerio";
import { fetchHtml } from "./postings.js";
import { parseDkPrice } from "../util.js";
const SKIP_TAGS = new Set(["script", "style", "noscript", "svg"]);
const PRICE_LINE = /^\d[\d.]*(,\d{1,2})?\s*kr\.?$/i; // "795 kr."  "1.299,00 kr."
const DELIVERY_LINE = /^\d+(\s*-\s*\d+)?\s*dage?$/i; // "1-3 dage"  "2 dage"
// ---------- source 1: embedded merchant JSON ----------
// ..."type":"merchantFilterOption","id":"19691","name":"LensWay","count":1,"lowestPrice":{"amount":"283.00",...
const MERCHANT_RE =
  /"type":"merchantFilterOption","id":"([^"]*)","name":"((?:[^"\\]|\\.)*)","count":\d+,"lowestPrice":\{"amount":"([\d.]+)"/g;
function offersFromMerchants(html) {
  const byId = new Map();
  for (const m of html.matchAll(MERCHANT_RE)) {
    const id = m[1];
    let shop = m[2];
    try {
      shop = JSON.parse(`"${shop}"`); // decode \u0026 etc.
    } catch {}
    const price = Math.round(Number(m[3]));
    if (!Number.isFinite(price) || price <= 0) continue;
    const old = byId.get(id);
    if (!old || price < old.price) byId.set(id, { shop, price, source: "merchants" });
  }
  return [...byId.values()];
}
// ---------- source 2: visible text ----------
function visibleLines($) {
  const lines = [];
  const walk = (node) => {
    if (node.type === "text") {
      const t = node.data.replace(/\s+/g, " ").trim();
      if (t) lines.push(t);
    } else if (node.children && !SKIP_TAGS.has(node.name)) {
      node.children.forEach(walk);
    }
  };
  $("body").each((_, el) => walk(el));
  return lines;
}
function offersFromText(lines) {
  const offers = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!DELIVERY_LINE.test(lines[i]) || !PRICE_LINE.test(lines[i + 1])) continue;
    const price = parseDkPrice(lines[i + 1]);
    if (price == null) continue;
    let shop = "?";
    for (let j = i - 1; j >= Math.max(1, i - 8); j--) {
      if (lines[j] === lines[j - 1]) {
        shop = lines[j];
        break;
      }
    }
    offers.push({ shop, price, source: "text" });
  }
  return offers;
}
// ---------- source 3: JSON-LD ----------
function offersFromJsonLd($) {
  const offers = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let data;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    const stack = [data];
    while (stack.length) {
      const x = stack.pop();
      if (Array.isArray(x)) {
        stack.push(...x);
        continue;
      }
      if (!x || typeof x !== "object") continue;
      if (x["@graph"]) stack.push(x["@graph"]);
      if (x.offers) stack.push(x.offers);
      const types = [].concat(x["@type"] ?? []);
      if (x.lowPrice != null && Number(x.lowPrice) > 0) {
        offers.push({ shop: "(lowest price, JSON-LD)", price: Number(x.lowPrice), source: "jsonld" });
      } else if (types.includes("Offer") && Number(x.price) > 0) {
        offers.push({ shop: x.seller?.name ?? "?", price: Number(x.price), source: "jsonld" });
      }
    }
  });
  return offers;
}
export function parseOffers(html) {
  let offers = offersFromMerchants(html);
  if (offers.length === 0) {
    const $ = cheerio.load(html);
    offers = offersFromText(visibleLines($));
    if (offers.length === 0) offers = offersFromJsonLd($);
  }
  return offers.sort((a, b) => a.price - b.price);
}
// Remove offers from shops listed in "excludeShops".
function applyExclusions(offers, list) {
  const ex = [].concat(list ?? [])
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean);
  if (ex.length === 0) return offers;
  return offers.filter((o) => !ex.some((e) => o.shop.toLowerCase().includes(e)));
}
export async function fetchPrice(url, w = {}) {
  const html = await fetchHtml(url);
  const all = parseOffers(html);
  if (all.length === 0) {
    throw new Error(
      "No prices found on " + url + " (layout may have changed, or the page is blocked)"
    );
  }
  const offers = applyExclusions(all, w.excludeShops);
  if (offers.length < all.length) {
    console.log(`Excluded ${all.length - offers.length} offer(s) from: ${[].concat(w.excludeShops).join(", ")}`);
  }
  if (offers.length === 0) {
    throw new Error("All offers were excluded by excludeShops");
  }
  return offers;
}