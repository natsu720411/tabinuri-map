import { itinerarySchema } from "../lib/tripItinerary.js";
import { redactGeminiMessage } from "../lib/geminiDiagnostics.js";

export const config = { maxDuration: 60 };

async function runCheck({ model, apiKey, generationConfig, prompt }) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(generationConfig ? { generationConfig } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    let body = {};
    try { body = await response.json(); } catch { /* no body */ }
    const message = typeof body.error?.message === "string" ? redactGeminiMessage(body.error.message, { GEMINI_API_KEY: apiKey }) : "";
    return { ok: response.ok, status: response.status, message };
  } catch {
    return { ok: false, status: 0, message: "request failed or timed out" };
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") { res.statusCode = 405; return res.end(JSON.stringify({ error: "GET only" })); }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  if (!apiKey) { res.statusCode = 503; return res.end(JSON.stringify({ ready: false })); }

  const simple = await runCheck({ model, apiKey, prompt: "Reply with only the word OK." });
  const legacyMinimal = await runCheck({
    model,
    apiKey,
    prompt: "Return JSON with ok true.",
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      maxOutputTokens: 100,
      temperature: 0.1,
    },
  });
  const legacyTrip = await runCheck({
    model,
    apiKey,
    prompt: "Create a sample two-day Japan itinerary. Use day 1 and day 2, each with one item at 09:00 titled Sample and memo Test.",
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: itinerarySchema(2),
      maxOutputTokens: 1000,
      temperature: 0.1,
    },
  });

  res.statusCode = 200;
  return res.end(JSON.stringify({ model, simple, legacyMinimal, legacyTrip }));
}
