// Load .env if it exists (Node 20.12+). No dependency needed.
try {
  process.loadEnvFile();
} catch {}
const once = process.argv.includes("--once");
console.log("hello");
console.log(once ? "mode: check once" : "mode: loop (not built yet)");