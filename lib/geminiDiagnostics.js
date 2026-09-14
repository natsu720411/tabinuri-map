// Server-side only. Never pass requests, response objects or exceptions to the logger.
export function redactGeminiMessage(message, env = process.env) {
  let text = typeof message === "string" ? message : "Gemini returned no readable error message.";
  const secrets = Object.entries(env).filter(([key, value]) => /key|token|secret|password|credential|authorization/i.test(key) && typeof value === "string" && value.length >= 4).map(([,value]) => value).sort((a,b)=>b.length-a.length);
  for (const secret of secrets) {
    for (const value of [secret, secret.trim(), encodeURIComponent(secret), JSON.stringify(secret).slice(1,-1)]) if (value) text = text.split(value).join("[REDACTED]");
  }
  return text
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[PRIVATE KEY REDACTED]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[TOKEN REDACTED]")
    .replace(/https?:\/\/[^\s<>"']+/gi, "[URL REDACTED]")
    .replace(/(?:authorization|x-goog-api-key)["']?\s*[:=][^\r\n]*/gi, "[CREDENTIAL REDACTED]")
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[CREDENTIAL REDACTED]")
    .replace(/\b(?:api[_-]?key|token|password|secret)["']?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "[CREDENTIAL REDACTED]")
    .replace(/AIza[\w-]+/g, "[KEY REDACTED]")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").slice(0, 1200);
}
export function createDiagnostics({ enabled = false, env = process.env, logger = console.error } = {}) {
  return ({ status, model, message }) => {
    if (!enabled || env.NODE_ENV === "production" || env.VERCEL) return;
    try { logger("[Gemini debug]", { status: Number.isInteger(status) ? status : "no HTTP response", model: redactGeminiMessage(model, env), message: redactGeminiMessage(message, env) }); } catch { /* Diagnostics must not affect the API response. */ }
  };
}
