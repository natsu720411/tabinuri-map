import { SHARE_URL } from "./share.js";

export const SHARE_FIELDS = [["places", "行きたい場所", true], ["foods", "食べたいもの", true], ["activities", "やりたいこと", true], ["departureLocation", "出発地点", false], ["departureTime", "出発したい時刻", false], ["returnLocation", "最終到着地点", false], ["returnTime", "最終到着したい時刻", false], ["companions", "誰と行くか", false], ["budget", "予算", false], ["accommodation", "宿泊先メモ", false], ["transport", "移動メモ", false], ["notes", "その他メモ", false]];
export const SHARE_ROUTE_FIELDS = new Set(["departureLocation", "departureTime", "returnLocation", "returnTime"]);
const MAX_BYTES = 160000;
const MAX_URL = 20000;
const fail = () => { throw new Error("共有する日程・文字数を確認してください。最大14日、1日30件、予定名200文字、メモ1000文字までです。"); };
function object(value) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(); }
function text(value, max, required = false) { if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(); return value; }
function date(value) {
  text(value, 10);
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) fail();
  return value;
}
export function tripDuration(plan) { return plan.startDate && plan.endDate ? Math.round((Date.parse(plan.endDate) - Date.parse(plan.startDate)) / 86400000) + 1 : null; }
// Explicitly reconstruct allowlisted fields. Local IDs, import markers and other data never travel.
export function validateSharedTrip(payload) {
  object(payload); if (payload.version !== 1 || payload.type !== "trip-plan") fail();
  const p = payload.plan; object(p);
  const plan = { title: text(p.title, 120, true), prefectureId: p.prefectureId, startDate: date(p.startDate), endDate: date(p.endDate) };
  if (!Number.isInteger(plan.prefectureId) || plan.prefectureId < 1 || plan.prefectureId > 47) fail();
  const duration = tripDuration(plan);
  if (duration !== null && (duration < 1 || duration > 14)) fail();
  if (!Array.isArray(p.days) || p.days.length > 14) fail();
  plan.days = p.days.map(day => {
    object(day); const dayDate = date(day.date);
    if (dayDate && ((plan.startDate && dayDate < plan.startDate) || (plan.endDate && dayDate > plan.endDate))) fail();
    if (!Array.isArray(day.items) || day.items.length > 30) fail();
    return { date: dayDate, items: day.items.map(item => {
      object(item); const time = text(item.time, 5);
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail();
      return { time, name: text(item.name, 200, true), memo: text(item.memo, 1000) };
    }) };
  });
  for (const [key] of SHARE_FIELDS) if (Object.hasOwn(p, key)) {
    const max = key === "budget" ? 30 : (key === "departureLocation" || key === "returnLocation" ? 200 : 2000);
    plan[key] = text(p[key], max);
  }
  for (const key of ["departureTime", "returnTime"]) if (plan[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan[key])) fail();
  return { version: 1, type: "trip-plan", plan };
}
export function selectSharedTrip(plan, selected) {
  const chosen = { title: plan.title, prefectureId: plan.prefectureId, startDate: plan.startDate, endDate: plan.endDate, days: plan.days };
  for (const [key] of SHARE_FIELDS) if (selected[key]) chosen[key] = plan[key] || "";
  return validateSharedTrip({ version: 1, type: "trip-plan", plan: chosen });
}
async function boundedBytes(stream) {
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await reader.cancel(); fail(); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
function base64url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export async function createTripLink(plan, selected, { compress = true, base = SHARE_URL } = {}) {
  const payload = selectSharedTrip(plan, selected);
  let bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_BYTES) fail();
  let format = "j1";
  if (compress && typeof CompressionStream === "function" && typeof DecompressionStream === "function") {
    try { const zipped = await boundedBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"))); if (zipped.length < bytes.length) { bytes = zipped; format = "g1"; } } catch { /* Use the UTF-8 format if compression is unavailable. */ }
  }
  const url = new URL(base); url.pathname = "/"; url.search = "?shared-trip=1"; url.hash = `${format}.${base64url(bytes)}`;
  if (url.href.length > MAX_URL) throw new Error("共有リンクが20,000文字を超えました。共有項目やスケジュールのメモを減らしてください。");
  return url.href;
}
export async function readTripFragment(hash) {
  if (typeof hash !== "string" || hash.length > MAX_URL || !/^#(?:j1|g1)\.[A-Za-z0-9_-]+$/.test(hash)) fail();
  const [format, value] = hash.slice(1).split(".");
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  let bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (format === "g1") {
    if (typeof DecompressionStream !== "function") throw new Error("圧縮リンクに対応していないブラウザです。ブラウザを更新するか、送信者に「圧縮しない互換リンク」での再共有を依頼してください。");
    bytes = await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
  }
  if (bytes.length > MAX_BYTES) fail();
  return validateSharedTrip(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))).plan;
}
export function lineTripLink(title, url) {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`旅図帳で「${title}」のしおりを作りました！\n一緒に予定をチェックしよう。`)}`;
}
