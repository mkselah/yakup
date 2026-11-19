// Watcher type "postings": reads a Shopify "grid-product" listing page
// (toogreattocancel.dk) and returns an array of postings.
import * as cheerio from "cheerio";
import { parseDkPrice } from "../util.js";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}
// "Afrejse 29.11.2026 - Hurghada - 2 personer - 7 nætter - Fly ..." -> pieces
function parseTitle(title) {
  const parts = title.split(" - ").map((p) => p.trim());
  const dateMatch = title.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return {
    departDate: dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null,
    destination: parts.length >= 4 ? parts[1] : null,
    persons: parts.length >= 4 ? parts[2] : null,
    duration: parts.length >= 4 ? parts[3] : null,
  };
}
export function parsePostings(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();
  $(".grid-product[data-product-id]").each((_, el) => {
    const $el = $(el);
    const id = $el.attr("data-product-id");
    if (!id || seen.has(id)) return;
    const title = $el
      .find(".grid-product__title")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const href = $el.find("a.grid-product__link").first().attr("href");
    if (!title || !href) return;
    const soldOut = $el.hasClass("sold-out");
    // Current price = text of the price box without any <span> children.
    const $price = $el.find(".grid-product__price").first().clone();
    $price.find("span").remove();
    const price = parseDkPrice($price.text());
    const oldPrice = parseDkPrice(
      $el.find(".grid-product__price--original").first().text()
    );
    // Marketing tag like "5-stjernet resort" (only on available postings).
    const tag = soldOut
      ? null
      : $el
          .find(".grid-product__tag--sold-out")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim() || null;
    const imgSrc = $el.find("img.grid-product__image").first().attr("src");
    seen.add(id);
    items.push({
      id,
      handle: $el.attr("data-product-handle") || null,
      title,
      url: new URL(href, baseUrl).href,
      price,
      oldPrice,
      soldOut,
      tag,
      image: imgSrc ? new URL(imgSrc, baseUrl).href : null,
      ...parseTitle(title),
    });
  });
  return items;
}
export async function fetchPostings(url) {
  const html = await fetchHtml(url);
  const items = parsePostings(html, url);
  if (items.length === 0) {
    throw new Error(
      "0 postings parsed from " + url + " (layout may have changed, or the page is blocked)"
    );
  }
  return items;
}