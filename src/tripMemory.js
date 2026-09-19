export const importedIds = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && id))] : [];
const parts = value => typeof value === "string" ? value.split(/[\n、,，;；]+/).map(s => s.trim()).filter(Boolean) : [];

const text = value => typeof value === "string" ? value : "";
const nonNegativeInt = value => Number.isInteger(value) && value >= 0 ? value : 0;

export function normalizeTravelLogs(value) {
  if (!Array.isArray(value)) return [];
  return value.map(log => {
    if (!log || typeof log !== "object" || typeof log.id !== "string" || !log.id) return null;
    const days = Array.isArray(log.days) ? log.days.map(day => {
      if (!day || typeof day !== "object") return null;
      const entries = Array.isArray(day.entries) ? day.entries.map(entry => {
        if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) return null;
        return {
          id: entry.id,
          name: text(entry.name),
          at: text(entry.at),
          kind: ["チェックイン", "完了", "立ち寄り"].includes(entry.kind) ? entry.kind : "立ち寄り",
          memo: text(entry.memo),
          photoCount: nonNegativeInt(entry.photoCount),
        };
      }).filter(Boolean) : [];
      return { date: text(day.date), label: text(day.label), entries };
    }).filter(Boolean) : [];
    return {
      id: log.id,
      title: text(log.title),
      startDate: text(log.startDate),
      endDate: text(log.endDate),
      savedAt: text(log.savedAt),
      days,
    };
  }).filter(Boolean);
}

function createTravelLog(plan) {
  const days = (plan.days || []).map((day, index) => {
    const scheduled = (day.items || [])
      .filter(item => item.checkedInAt || item.completedAt)
      .map(item => ({
        id: `item:${item.id}`,
        name: text(item.name),
        at: text(item.checkedInAt || item.completedAt),
        kind: item.checkedInAt ? "チェックイン" : "完了",
        memo: text(item.travelMemo),
        photoCount: nonNegativeInt(item.travelPhotoCount),
      }));
    const extras = (day.extraStops || [])
      .filter(stop => stop.visitedAt)
      .map(stop => ({
        id: `stop:${stop.id}`,
        name: text(stop.name),
        at: text(stop.visitedAt),
        kind: "立ち寄り",
        memo: text(stop.travelMemo),
        photoCount: nonNegativeInt(stop.travelPhotoCount),
      }));
    const entries = [...scheduled, ...extras].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return {
      date: text(day.date),
      label: day.date ? "" : `${index + 1}日目`,
      entries,
    };
  }).filter(day => day.entries.length > 0);

  return {
    id: plan.id,
    title: text(plan.title),
    startDate: text(plan.startDate),
    endDate: text(plan.endDate),
    savedAt: new Date().toISOString(),
    days,
  };
}

export function appendUnique(existing, added) {
  const seen = new Set(parts(existing));
  const extra = parts(added).filter(item => { if (seen.has(item)) return false; seen.add(item); return true; });
  return [existing || "", ...extra].filter(Boolean).join("\n");
}

export function importDefaults(plan) {
  const items = (plan.days || []).flatMap(day => (day.items || []).map(item => ({ ...item, dayDate: day.date || "" })));
  const names = items.map(item => item.name || "")
    .filter(name => !/^(出発|到着|移動|ホテル(?:へ移動|へ|に移動)?|朝食|昼食|夕食|昼ごはん|夜ごはん|休憩|チェックイン|チェックアウト)$/.test(name.trim()));
  const travelNotes = items.filter(item => item.travelMemo?.trim()).map(item => {
    const label = [item.dayDate, item.name].filter(Boolean).join(" ");
    return `${label ? `【${label}】\n` : ""}${item.travelMemo.trim()}`;
  });
  const extraStopNotes = (plan.days || []).flatMap(day => (day.extraStops || []).map(stop => ({ ...stop, dayDate: day.date || "" })))
    .filter(stop => stop.travelMemo?.trim())
    .map(stop => {
      const label = [stop.dayDate, stop.name].filter(Boolean).join(" ");
      return `${label ? `【${label}】\n` : ""}${stop.travelMemo.trim()}`;
    });
  return {
    visitDate: plan.startDate || "",
    companions: plan.companions || "",
    foods: plan.foods || "",
    recommendedSpots: appendUnique("", [plan.places || "", ...names].join("\n")),
    memory: [plan.notes || "", ...travelNotes, ...extraStopNotes].filter(Boolean).join("\n\n"),
  };
}

export function mergeTripMemory(existing, plan, values) {
  const ids = importedIds(existing.importedTripPlanIds);
  if (ids.includes(plan.id)) return existing;
  const entry = [`【${plan.title.trim()}】`, `旅行日程：${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`, `訪問日：${values.visitDate || "未設定"}`, values.memory?.trim()].filter(Boolean).join("\n");
  const existingLogs = normalizeTravelLogs(existing.travelLogs);
  const tripLog = createTravelLog(plan);
  return {
    ...existing,
    visited: true,
    visitDate: existing.visitDate || values.visitDate || "",
    memory: [existing.memory, entry].filter(Boolean).join("\n\n"),
    companions: appendUnique(existing.companions, values.companions),
    foods: appendUnique(existing.foods, values.foods),
    recommendedSpots: appendUnique(existing.recommendedSpots, values.recommendedSpots),
    importedTripPlanIds: [...ids, plan.id],
    travelLogs: tripLog.days.length ? [...existingLogs, tripLog] : existingLogs,
  };
}
