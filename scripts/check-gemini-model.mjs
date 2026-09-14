import { existsSync } from "node:fs";
import { createDiagnostics } from "../lib/geminiDiagnostics.js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const report = createDiagnostics({ enabled: true });
const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  console.error("This diagnostic command is for local development only."); process.exitCode = 1;
} else if (!process.env.GEMINI_API_KEY?.trim() || !/^gemini-[a-zA-Z0-9._-]+$/.test(model)) {
  console.error("GEMINI_API_KEY / GEMINI_MODEL の設定を確認してください（値は表示しません）。"); process.exitCode = 1;
} else {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
    let body; try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) { report({ status: response.status, model, message: body.error?.message }); process.exitCode = 1; }
    else { const supported = body.supportedGenerationMethods?.includes("generateContent") === true; report({ status: response.status, model, message: `Model metadata available; generateContent supported: ${supported}. This does not verify generation quota or actual generation.` }); if (!supported) process.exitCode = 1; }
  } catch { report({ model, message: "Model metadata request failed or timed out." }); process.exitCode = 1; }
}
