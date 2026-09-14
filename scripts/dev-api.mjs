import { createServer } from "node:http";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createHandler } = await import("../api/generate-trip.js");
const handler = createHandler({ diagnostics: true });
createServer((req, res) => {
  if (req.url?.split("?")[0] !== "/api/generate-trip") { res.writeHead(404); res.end(); return; }
  handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "AI旅程の作成に失敗しました。もう一度お試しください。" })); });
}).listen(3001, "127.0.0.1", () => console.log("Trip API: http://127.0.0.1:3001 (local only)"));
