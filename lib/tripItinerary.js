export const MAX_TRIP_DAYS = 14;
export const MOODS = ["おまかせ", "グルメ重視", "観光重視", "のんびり", "アクティブ", "写真映え", "子連れ向け", "カップル向け"];
export const PACES = ["ゆったり", "普通", "たくさん回る"];
export const TRANSPORT_STYLES = ["おまかせ", "公共交通中心", "車中心", "徒歩を少なめ"];
export const PLAN_FIELDS = ["title", "startDate", "endDate", "departureLocation", "departureTime", "returnLocation", "returnTime", "people", "companions", "budget", "places", "foods", "activities", "accommodation", "transport", "notes"];
export const AI_NOTICE = "AIの路線・乗換・所要時間は旅程作成時点の目安です。正確な発車時刻・運賃・運休情報・営業時間は旅行前に交通機関や施設の公式情報でご確認ください。";
function dateTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("出発日と帰宅日を入力してください。");
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error("日付を確認してください。");
  return time;
}
export function tripDates(start, end) {
  const first = dateTime(start), last = dateTime(end);
  const count = (last - first) / 86400000 + 1;
  if (count < 1 || count > MAX_TRIP_DAYS) throw new Error(`AI作成は帰宅日が出発日以降の1〜${MAX_TRIP_DAYS}日間に対応しています。`);
  return Array.from({ length: count }, (_, i) => new Date(first + i * 86400000).toISOString().slice(0, 10));
}
export function validateRequest(value) {
  if (!value || !value.plan || !MOODS.includes(value.mood) || !PACES.includes(value.pace) || !TRANSPORT_STYLES.includes(value.transportStyle)) throw new Error("旅行の雰囲気・ペース・移動手段を選んでください。");
  if (value.requestNote != null && typeof value.requestNote !== "string") throw new Error("AIへの追加希望を確認してください。");
  const requestNote = typeof value.requestNote === "string" ? value.requestNote.trim() : "";
  if (requestNote.length > 1000) throw new Error("AIへの追加希望は1000文字以内にしてください。");
  const plan = { prefectureId: value.plan.prefectureId };
  if (!Number.isInteger(plan.prefectureId) || plan.prefectureId < 1 || plan.prefectureId > 47) throw new Error("行き先の都道府県を選んでください。");
  let length = 0;
  for (const field of PLAN_FIELDS) {
    const input = value.plan[field];
    if (input == null || input === "") continue;
    if (typeof input !== "string" || input.length > 2000) throw new Error("入力は各項目2000文字以内にしてください。");
    if (input.trim()) plan[field] = input.trim();
    length += input.length;
  }
  if (length > 12000) throw new Error("計画の入力内容を合計12000文字以内にしてください。");
  if (!plan.departureLocation || !plan.returnLocation) throw new Error("AI作成には出発地点と最終到着地点を入力してください。");
  if (plan.departureTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.departureTime)) throw new Error("出発したい時刻を確認してください。");
  if (plan.returnTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.returnTime)) throw new Error("最終到着したい時刻を確認してください。");
  if (plan.people && (!/^\d+$/.test(plan.people) || Number(plan.people) < 1 || Number(plan.people) > 1000)) throw new Error("人数は1〜1000の整数にしてください。");
  if (plan.budget && (!/^\d+$/.test(plan.budget) || !Number.isSafeInteger(Number(plan.budget)))) throw new Error("予算は0以上の整数で入力してください。");
  return { plan, mood: value.mood, pace: value.pace, transportStyle: value.transportStyle, requestNote, dates: tripDates(plan.startDate, plan.endDate) };
}
export function validateItinerary(value, count) {
  if (!value || !Array.isArray(value.days) || value.days.length !== count) throw new Error("AIの旅行日数が一致しません。");
  return { days: value.days.map((day, i) => {
    if (!day || day.day !== i + 1 || !Array.isArray(day.items) || day.items.length < 1 || day.items.length > 16) throw new Error("AIの予定形式が正しくありません。");
    const items = day.items.map((item, originalIndex) => {
      if (!item || typeof item.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 180 || typeof item.memo !== "string" || item.memo.length > 1400) throw new Error("AIの予定内容が正しくありません。");
      return { time: item.time, title: item.title.trim(), memo: item.memo.trim(), originalIndex };
    }).sort((a, b) => a.time.localeCompare(b.time) || a.originalIndex - b.originalIndex)
      .map(({ originalIndex, ...item }) => item);
    return { day: i + 1, items };
  }) };
}
export function itinerarySchema(count) {
  return { type: "object", required: ["days"], properties: { days: { type: "array", minItems: count, maxItems: count, items: { type: "object", required: ["day", "items"], properties: { day: { type: "integer", minimum: 1, maximum: count }, items: { type: "array", minItems: 1, maxItems: 16, items: { type: "object", required: ["time", "title", "memo"], properties: { time: { type: "string" }, title: { type: "string" }, memo: { type: "string" } } } } } } } } };
}
