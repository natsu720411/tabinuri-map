const EVENT_NAME = /^[a-z][a-z0-9_]{1,39}$/;
const SAFE_KEYS = new Set(["source", "action", "result"]);

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  if (new URLSearchParams(window.location.search).has("shared-trip")) return;
  if (!EVENT_NAME.test(name)) return;

  const safe = {};
  for (const [key, value] of Object.entries(params)) {
    if (!SAFE_KEYS.has(key)) continue;
    if (typeof value !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(value)) continue;
    safe[key] = value;
  }
  window.gtag("event", name, safe);
}
