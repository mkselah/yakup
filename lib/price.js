const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";
function buildPrompt(item) {
  return `Find the current retail price in Denmark for this product: "${item}"
Rules:
- Only use Danish web shops or Danish price comparison sites (e.g. pricerunner.dk, prisjagt.dk, or .dk shops). Prices must be in DKK including moms.
- Prefer the lowest price from a reputable shop where the item is new and in stock.
- The product must match the description (brand, model, size, variant). If the description is ambiguous, choose the most common variant and explain in "note".
- If you cannot find a reliable Danish price, set "price" to null.
Reply with ONLY a JSON object and no other text:
{"price": <number or null>, "shop": "<shop name>", "url": "<direct product link>", "matched_product": "<exact product name you priced>", "confidence": "high" | "medium" | "low", "note": "<short note, optional>"}`;
}
export async function findPrice(item) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY in .env");
  if (!item || !item.trim()) throw new Error("Empty item");
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
          user_location: {
            type: "approximate",
            country: "DK",
            timezone: "Europe/Copenhagen",
          },
        },
      ],
      messages: [{ role: "user", content: buildPrompt(item) }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Claude API ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const match = text.match(/\{[\s\S]*\}/);
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
  if (typeof result.price !== "number") result.price = null;
  if (result.url && !/^https?:\/\//.test(result.url)) result.url = "";
  console.log(`[${item}] →`, result.price, result.shop, `(${result.confidence})`);
  return result;
}