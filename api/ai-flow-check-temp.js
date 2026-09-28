import { createHandler } from "./generate-trip.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "GET only" }));
  }

  const inner = createHandler({ rateLimit: () => true });
  const fakeReq = {
    method: "POST",
    headers: {
      host: req.headers.host || "tabinuri-map.vercel.app",
      "content-type": "application/json",
      "x-forwarded-for": "diagnostic",
    },
    socket: { remoteAddress: "diagnostic" },
    body: {
      plan: {
        title: "診断用京都旅行",
        prefectureId: 26,
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        departureLocation: "京都駅",
        returnLocation: "京都駅",
      },
      mood: "おまかせ",
      pace: "普通",
      transportStyle: "公共交通中心",
      requestNote: "診断用。各日2件程度の簡潔な旅程にしてください。",
    },
  };

  let captured = null;
  const fakeRes = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) {
      try { captured = { status: this.statusCode, body: JSON.parse(value) }; }
      catch { captured = { status: this.statusCode, body: { error: "non-json response" } }; }
    },
  };

  try {
    await inner(fakeReq, fakeRes);
    const ok = captured?.status === 200;
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok, status: captured?.status ?? 0, error: ok ? "" : String(captured?.body?.error || "unknown") }));
  } catch {
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: false, status: 0, error: "diagnostic handler failed" }));
  }
}
