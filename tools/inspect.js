// Phase 3.1 helper: checks whether a page's data is in the static HTML.
// Usage: npm run inspect -- <url> "<text you see on a posting>"
import { mkdirSync, writeFileSync } from "node:fs";
import * as cheerio from "cheerio";
const url = process.argv[2] || "https://toogreattocancel.dk/";
const needle = (process.argv[3] || "").trim();
const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
  },
  signal: AbortSignal.timeout(20000),
});
const html = await res.text();
mkdirSync("data", { recursive: true });
writeFileSync("data/page.html", html);
const $ = cheerio.load(html);
const bodyText = $("body").text().replace(/\s+/g, " ").trim();
console.log("URL:            ", url);
console.log("Status:         ", res.status);
console.log("Content-Type:   ", res.headers.get("content-type"));
console.log("HTML size:      ", html.length, "chars");
console.log("<title>:        ", $("title").first().text().trim());
console.log("Visible text:   ", bodyText.length, "chars");
console.log("<a> links:      ", $("a").length);
console.log("<script> tags:  ", $("script").length);
console.log("Body preview:   ", bodyText.slice(0, 300));
console.log("");
// Framework / data markers
const markers = {
  "__NEXT_DATA__ (Next.js)": /__NEXT_DATA__/,
  "__NUXT__ (Nuxt)": /__NUXT__/,
  "window.__INITIAL_STATE__": /__INITIAL_STATE__/,
  "JSON-LD": /application\/ld\+json/,
  "empty root/app div": /<div id="(root|app)"><\/div>/,
  "WordPress": /wp-content|wp-json/,
  "Supabase": /supabase/i,
  "Firebase": /firebase/i,
  "GraphQL": /graphql/i,
};
console.log("Markers found:");
for (const [name, re] of Object.entries(markers)) {
  if (re.test(html)) console.log("  -", name);
}
console.log("");
// Possible API / JSON URLs mentioned in the HTML
const apiRe = /["'`]((?:https?:)?\/\/[^"'`\s]+|\/[^"'`\s]*)["'`]/g;
const candidates = new Set();
for (const m of html.matchAll(apiRe)) {
  if (/api|\.json|graphql|wp-json|supabase|firebase/i.test(m[1]) && m[1].length < 200) {
    candidates.add(m[1]);
  }
}
console.log("Possible API/JSON URLs in the HTML:");
if (candidates.size === 0) console.log("  (none)");
[...candidates].slice(0, 15).forEach((c) => console.log("  -", c));
console.log("");
// Is a posting's text in the raw HTML?
if (!needle) {
  console.log('No search text given. Re-run with a title you see on the page:');
  console.log('  npm run inspect -- https://toogreattocancel.dk/ "some title"');
} else {
  const idx = html.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) {
    console.log(`VERDICT: "${needle}" is NOT in the raw HTML.`);
    console.log("-> Data is probably loaded by JavaScript. Do the DevTools Network step.");
  } else {
    const count = html.toLowerCase().split(needle.toLowerCase()).length - 1;
    console.log(`VERDICT: "${needle}" FOUND in raw HTML (${count}x).`);
    console.log("-> Static HTML (or JSON embedded in it). Cheerio will work.");
    const snippet = html.slice(Math.max(0, idx - 800), idx + 1500);
    writeFileSync("data/snippet.html", snippet);
    console.log("Saved the HTML around it to data/snippet.html");
  }
}
console.log("Full page saved to data/page.html");