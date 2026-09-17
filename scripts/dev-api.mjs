import { createServer } from "node:http";
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { createHandler: createTripHandler } = await import("../api/generate-trip.js");
const { createHandler: createNearbyHandler } = await import("../api/nearby-places.js");
const tripHandler = createTripHandler({ diagnostics: true });
const nearbyHandler = createNearbyHandler();
createServer((req, res) => {
  const pathname = req.url?.split("?")[0];
  const handler = pathname === "/api/generate-trip" ? tripHandler : pathname === "/api/nearby-places" ? nearbyHandler : null;
  if (!handler) { res.writeHead(404); res.end(); return; }
  handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "処理に失敗しました。もう一度お試しください。" }));
  });
}).listen(3001, "127.0.0.1", () => console.log("Trip APIs: http://127.0.0.1:3001 (local only)"));
