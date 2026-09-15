export const importedIds = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && id))] : [];
const parts = value => typeof value === "string" ? value.split(/[\n、,，;；]+/).map(s => s.trim()).filter(Boolean) : [];
export function appendUnique(existing, added) {
  const seen = new Set(parts(existing));
  const extra = parts(added).filter(item => { if (seen.has(item)) return false; seen.add(item); return true; });
  return [existing || "", ...extra].filter(Boolean).join("\n");
}
export function importDefaults(plan) {
  const names = (plan.days || []).flatMap(day => (day.items || []).map(item => item.name || ""))
    .filter(name => !/^(出発|到着|移動|ホテル(?:へ移動|へ|に移動)?|朝食|昼食|夕食|昼ごはん|夜ごはん|休憩|チェックイン|チェックアウト)$/.test(name.trim()));
  return { visitDate: plan.startDate || "", companions: plan.companions || "", foods: plan.foods || "", recommendedSpots: appendUnique("", [plan.places || "", ...names].join("\n")), memory: plan.notes || "" };
}
export function mergeTripMemory(existing, plan, values) {
  const ids = importedIds(existing.importedTripPlanIds);
  if (ids.includes(plan.id)) return existing;
  const entry = [`【${plan.title.trim()}】`, `旅行日程：${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`, `訪問日：${values.visitDate || "未設定"}`, values.memory?.trim()].filter(Boolean).join("\n");
  return { ...existing, visited: true, visitDate: existing.visitDate || values.visitDate || "",
    memory: [existing.memory, entry].filter(Boolean).join("\n\n"),
    companions: appendUnique(existing.companions, values.companions), foods: appendUnique(existing.foods, values.foods),
    recommendedSpots: appendUnique(existing.recommendedSpots, values.recommendedSpots), importedTripPlanIds: [...ids, plan.id] };
}
