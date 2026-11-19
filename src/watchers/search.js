// Watcher type "search": asks Claude (with web search) for the current Danish price of an item.
// Needs ANTHROPIC_API_KEY in .env.
// Returns the same shape as price.js: [{ shop, price, source, url, product, confidence }]
//
// watchers.json:
//   { "name": "...", "type": "search", "item": "Sony WH-1000XM5", "target": 1800,
//     "times": ["12:00"], "excludeShops": ["SomeShop"] }
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
function buildPrompt(item, excludeShops) {
  const ex = [].concat(excludeShops ?? []).filter(Boolean);
  const exLine = ex.length ? `\n- Do NOT use these shops: ${ex.join(", ")}.` : "";
  return `Find the current retail price in Denmark for this product: "${item}"
Rules:
- Only use Danish web shops or Danish price comparison sites (e.g. pricerunner.dk, prisjagt.dk, or .dk shops). Prices must be in DKK including moms.
- Prefer the lowest price from a reputable shop where the item is new and in stock.
- The product must match the description (brand, model, size, variant). If the description is ambiguous, choose the most common variant and explain in "note".
- If you cannot find a reliable Danish price, set "price" to null.${exLine}
Reply with ONLY a JSON object and no other text:
{"price": <number or null>, "shop": "<shop name>", "url": "<direct product link>", "matched_product": "<exact product name you priced>", "confidence": "high" | "medium" | "low", "note": "<short note, optional>"}`;
}
async function askClaude(item, excludeShops) {
  // Read env here (not at the top): .env is loaded after the imports are evaluated.
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY in .env");
  if (!item || !item.trim()) throw new Error('Watcher has no "item"');
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
          user_location: { type: "approximate", country: "DK", timezone: "Europe/Copenhagen" },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(item, excludeShops) }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  // The answer JSON has no nested braces, so this finds it even if Claude adds chatter.
  const match = text.match(/\{[^{}]*"price"[^{}]*\}/);
  if (!match) throw new Error("No JSON in answer: " + text.slice(0, 200));
  let result;
  try {
    result = JSON.parse(match[0]);
  } catch {
    throw new Error("Could not parse answer: " + match[0].slice(0, 200));
  }
  if (typeof result.price === "string") {
    const n = Number(result.price.replace(/[^\d.]/g, ""));
    result.price = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (typeof result.price !== "number" || !(result.price > 0)) result.price = null;
  if (result.url && !/^https?:\/\//.test(result.url)) result.url = "";
  return result;
}
export async function fetchSearch(_url, w = {}) {
  const r = await askClaude(w.item, w.excludeShops);
  if (r.price == null) {
    throw new Error("No reliable price found" + (r.note ? ` (${r.note})` : ""));
  }
  if (r.confidence === "low") {
    throw new Error(`Low-confidence match ignored: ${r.matched_product ?? "?"} at ${r.price} kr`);
  }
  console.log(`[${w.item}] -> ${r.price} ${r.shop} (${r.confidence}) ${r.matched_product ?? ""}`);
  return [
    {
      shop: r.shop || "?",
      price: Math.round(r.price),
      source: "ai",
      url: r.url || "",
      product: r.matched_product || "",
      confidence: r.confidence || "",
    },
  ];
}