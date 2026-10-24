import http from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { listTabs, loadItems, writeResult, parseSheetId } from "./lib/sheets.js";
import { findPrice } from "./lib/price.js";
const PORT = process.env.PORT || 3000;
// Locally: 127.0.0.1 (only your PC). Online: set HOST=0.0.0.0
const HOST = process.env.HOST || "127.0.0.1";
const PASSWORD = process.env.APP_PASSWORD || "";
if (HOST !== "127.0.0.1" && !PASSWORD) {
  console.error("Refusing to start: APP_PASSWORD must be set when the server is public.");
  process.exit(1);
}
function authorized(req) {
  if (!PASSWORD) return true;
  const given = Buffer.from(String(req.headers["x-app-password"] || ""));
  const want = Buffer.from(PASSWORD);
  return given.length === want.length && timingSafeEqual(given, want);
}
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
};
const routes = {
  "/api/tabs": ({ sheet }) => listTabs(parseSheetId(sheet)),
  "/api/items": ({ sheet, tab }) => loadItems(parseSheetId(sheet), tab),
  "/api/price": ({ item }) => findPrice(item),
  "/api/write": async ({ sheet, tab, row, columns, result, item }) => {
    const updated = await writeResult(parseSheetId(sheet), tab, row, columns, result, item);
    return { ok: true, updated };
  },
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "POST" && routes[url.pathname]) {
        if (!authorized(req)) {
          return send(res, 401, JSON.stringify({ error: "Wrong password" }), "application/json");
        }
        const body = JSON.parse((await readBody(req)) || "{}");
        const out = await routes[url.pathname](body);
        return send(res, 200, JSON.stringify(out), "application/json");
      }
      const file = STATIC[url.pathname];
      if (req.method === "GET" && file) {
        const content = await readFile(new URL(file[0], import.meta.url));
        return send(res, 200, content, file[1]);
      }
      send(res, 404, "Not found", "text/plain");
    } catch (e) {
      console.error(`${url.pathname} error:`, e.message);
      send(res, 500, JSON.stringify({ error: e.message }), "application/json");
    }
  })
  // Only listen on localhost, so nobody else on the network can use your API keys
  .listen(PORT, HOST, () => {
    console.log(`Price checker running at http://localhost:${PORT}`);
  });