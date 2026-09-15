import { validateSharedTrip } from "./tripShare.js";
import { newId, newPlan, loadPlans, persistPlans } from "./tripPlans.js";

export async function sharedFingerprint(shared) {
  const payload = validateSharedTrip({ version: 1, type: "trip-plan", plan: shared });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
  return `sha256:${Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function copySharedPlan(shared, title) {
  const validated = validateSharedTrip({ version: 1, type: "trip-plan", plan: shared }).plan;
  if (typeof title !== "string" || !title.trim() || title.length > 120) throw new Error("旅行タイトルを1〜120文字で入力してください。");
  // Fingerprint the original content, not the locally edited title or URL encoding.
  const sharedSourceId = await sharedFingerprint(validated);
  const save = () => {
    const store = loadPlans();
    if (store.error) throw new Error(store.error);
    const existing = store.plans.find(plan => plan.sharedSourceId === sharedSourceId);
    if (existing) return { plan: existing, already: true };
    const now = new Date().toISOString();
    const plan = { ...newPlan(), ...validated, id: newId(), title: title.trim(), people: "1", status: "planning", travelBookSavedAt: "", sharedSourceId, createdAt: now, updatedAt: now,
      days: validated.days.map(day => ({ ...day, id: newId(), items: day.items.map(item => ({ ...item, id: newId() })) })) };
    try { persistPlans([...store.plans, plan]); }
    catch { throw new Error("旅の計画に保存できませんでした。ブラウザの保存容量や設定をご確認ください。"); }
    return { plan, already: false };
  };
  // Re-read after hashing, and serialize concurrent copies in supporting browsers.
  return globalThis.navigator?.locks ? navigator.locks.request("tabizucho-copy-shared-plan", async () => save()) : save();
}

export function openCopiedPlan(id) {
  // A full navigation restores normal SEO/analytics without retaining the shared URL.
  history.replaceState({ openCopiedPlan: id }, "", "/");
  location.reload();
}
