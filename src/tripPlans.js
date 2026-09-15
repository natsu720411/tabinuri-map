export const TRIP_PLANS_KEY = "tabizucho_trip_plans";
export const newId = () => crypto.randomUUID();
export function todayLocal() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function newPlan() {
  return { id: newId(), title: "", prefectureId: "", startDate: "", endDate: "", people: "1", companions: "", budget: "", places: "", foods: "", activities: "", accommodation: "", transport: "", notes: "", status: "planning", days: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
const fields = ["id", "title", "startDate", "endDate", "people", "companions", "budget", "places", "foods", "activities", "accommodation", "transport", "notes", "createdAt", "updatedAt"];
// Keep the version and stable IDs separate from prefecture memories for future linking.
export function loadPlans() {
  try {
    const raw = localStorage.getItem(TRIP_PLANS_KEY);
    if (!raw) return { plans: [], error: "" };
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.plans)) throw new Error();
    const ids = new Set();
    for (const plan of data.plans) {
      if (!plan || fields.some(key => typeof plan[key] !== "string") || !plan.id || ids.has(plan.id) || !["planning", "completed"].includes(plan.status) || !Number.isInteger(plan.prefectureId) || plan.prefectureId < 1 || plan.prefectureId > 47 || !Array.isArray(plan.days)) throw new Error();
      ids.add(plan.id);
      const dayIds = new Set();
      for (const day of plan.days) {
        if (!day || typeof day.id !== "string" || dayIds.has(day.id) || typeof day.date !== "string" || !Array.isArray(day.items)) throw new Error();
        dayIds.add(day.id);
        const itemIds = new Set();
        for (const item of day.items) {
          if (!item || ["id", "time", "name", "memo"].some(key => typeof item[key] !== "string") || itemIds.has(item.id)) throw new Error();
          itemIds.add(item.id);
        }
      }
    }
    return { plans: data.plans.map(plan => ({ ...plan, travelBookSavedAt: typeof plan.travelBookSavedAt === "string" ? plan.travelBookSavedAt : "", sharedSourceId: typeof plan.sharedSourceId === "string" && /^sha256:[a-f0-9]{64}$/.test(plan.sharedSourceId) ? plan.sharedSourceId : "" })), error: "" };
  } catch {
    return { plans: [], error: "旅行計画を読み込めませんでした。保存済みデータを保護するため編集を停止しています。サイトデータを削除せず、再読み込みをお試しください。" };
  }
}
export function persistPlans(plans) {
  localStorage.setItem(TRIP_PLANS_KEY, JSON.stringify({ version: 1, plans }));
}
