import React, { useEffect, useRef, useState } from "react";
import { AI_NOTICE, MOODS, PACES, PLAN_FIELDS, TRANSPORT_STYLES, validateRequest, validateItinerary } from "../lib/tripItinerary.js";
import { newId } from "./tripPlans.js";
import { googleMapsRouteForItem } from "./tripRoute.js";
const PREPARING = "AI機能は準備中です。管理者によるAPI設定が必要です。";
const PREFECTURE_NAMES = ["", "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
const prefectureNameForAI = id => PREFECTURE_NAMES[Number(id)] || "行き先";

export default function TripAI({ plan, blocked, onApply, onClose }) {
  const dialog = useRef(null), controller = useRef(null), busyRef = useRef(false), previewHeading = useRef(null);
  const [mood, setMood] = useState("おまかせ"), [pace, setPace] = useState("普通"), [transportStyle, setTransportStyle] = useState("おまかせ");
  const [requestNote, setRequestNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState(null);
  const [ready, setReady] = useState(null), [readinessAttempt, setReadinessAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setReady(null);
    const timeout = setTimeout(() => abort.abort(), 8000);
    async function checkReady() {
      try {
        const response = await fetch("/api/generate-trip", { method: "GET", cache: "no-store", signal: abort.signal });
        const payload = await response.json();
        if (active) setReady(response.ok && payload?.ready === true);
      } catch { if (active) setReady(false); }
      finally { clearTimeout(timeout); }
    }
    checkReady();
    return () => { active = false; clearTimeout(timeout); abort.abort(); };
  }, [readinessAttempt]);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement, overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { controller.current?.abort(); element.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { if (result) previewHeading.current?.focus(); }, [result]);
  async function generate() {
    if (busyRef.current || blocked || ready !== true) return;
    setError("");
    let request;
    try { request = validateRequest({ mood, pace, transportStyle, requestNote, plan: Object.fromEntries(["prefectureId", ...PLAN_FIELDS].map(key => [key, plan[key]])) }); }
    catch (err) { setError(err.message); return; }
    busyRef.current = true; setBusy(true); setResult(null);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 55000);
    try {
      const response = await fetch("/api/generate-trip", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ plan: request.plan, mood, pace, transportStyle, requestNote: request.requestNote }) });
      const payload = await response.json();
      if (response.status === 503 && payload.error === PREPARING) { setReady(false); return; }
      if (!response.ok) throw new Error([400, 413, 415, 429, 503].includes(response.status) && typeof payload.error === "string" ? payload.error : "AI旅程の作成に失敗しました。もう一度お試しください。");
      const checked = validateItinerary(payload, request.dates.length);
      setResult({ days: checked.days.map((day, index) => ({ id: newId(), date: request.dates[index], items: day.items.map(item => ({ id: newId(), time: item.time, name: item.title, memo: item.memo })) })) });
    } catch (err) { if (dialog.current?.open) setError(err.name === "AbortError" ? "作成に時間がかかっています。もう一度お試しください。" : (err.message.startsWith("AI") || err.message.includes("入力") || err.message.includes("設定") || err.message.includes("時間をおいて") ? err.message : "AI旅程の作成に失敗しました。もう一度お試しください。")); }
    finally { clearTimeout(timeout); busyRef.current = false; if (dialog.current?.open) setBusy(false); }
  }
  return <dialog ref={dialog} className="trip-ai-dialog" aria-labelledby="trip-ai-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="trip-ai-title">✨ AIで旅程を作る</h2>
    {ready === null && <p role="status">AIの利用可否を確認中…</p>}
    {ready === false && <div><p role="alert" className="trip-error">{PREPARING}</p><button type="button" onClick={() => { setError(""); setReadinessAttempt(value => value + 1); }}>接続・設定を再確認</button></div>}
    {!result && <><p>行き先・日程・出発地点・最終到着地点をもとに、1〜14日間の旅程を考えます。</p>
      <p><strong>{plan.departureLocation || "出発地点未入力"}{plan.departureTime ? `（${plan.departureTime}ごろ出発）` : ""} → {prefectureNameForAI(plan.prefectureId)} → {plan.returnLocation || "最終到着地点未入力"}{plan.returnTime ? `（${plan.returnTime}までに到着）` : ""}</strong><br />電車・バス・徒歩などの移動も、駅名・路線・乗換・おおよその所要時間までできるだけ細かく入れます。</p>
      <p className="trip-ai-disclosure">「AIで作成」を押すと、出発地点・希望時刻・移動手段・AIへの追加希望を含む入力中の計画情報を旅図帳のサーバー経由でGoogle Geminiへ送信します。写真や他の旅行記録は送りません。</p>
      <div className="trip-fields"><label>旅行の雰囲気<select autoFocus disabled={busy} value={mood} onChange={e => setMood(e.target.value)}>{MOODS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>旅行ペース<select disabled={busy} value={pace} onChange={e => setPace(e.target.value)}>{PACES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>移動手段の希望<select disabled={busy} value={transportStyle} onChange={e => setTransportStyle(e.target.value)}>{TRANSPORT_STYLES.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="trip-ai-request">AIへの追加希望（任意）<textarea rows={3} maxLength={1000} disabled={busy} value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="例：新幹線は使わない／徒歩は15分以内／交通費を抑えたい／昼までに京都駅へ着きたい" /><small>{requestNote.length} / 1000文字</small></label></div>
      <p>現在の予定は、プレビューで確認して「この旅程を使う」を押した場合だけ置き換わります。</p></>}
    <p role="status">{busy && <><span className="trip-ai-spinner" aria-hidden="true" /> AIが旅のしおりを作成中…</>}</p>
    {error && <p role="alert" className="trip-error">{error}</p>}
    {blocked && <p role="alert">保存データに変更があるため反映できません。一度閉じて画面の案内をご確認ください。</p>}
    {result && <><h3 tabIndex={-1} ref={previewHeading}>AIが作成した旅程</h3>
      {result.days.map((day, index) => <section key={day.id} className="trip-day"><h4>{index + 1}日目 · {day.date}</h4><ol className="trip-ai-items">{day.items.map(item => { const routeUrl = googleMapsRouteForItem(item); return <li key={item.id}><time>{item.time}</time><strong>{item.name}</strong><p>{item.memo}</p>{routeUrl && <a className="trip-route-link" href={routeUrl} target="_blank" rel="noopener noreferrer">Googleマップで経路を確認 ↗</a>}</li>; })}</ol></section>)}
      <p>{AI_NOTICE}</p><p>適用後も未保存です。内容を調整して「計画を保存」を押してください。</p></>}
    <div className="trip-ai-actions">
      {result ? <><button type="button" className="trip-primary" disabled={blocked} onClick={() => onApply(result.days)}>この旅程を使う</button><button type="button" onClick={() => { setResult(null); setError(""); }}>やり直す</button></> : <button type="button" className="trip-primary" disabled={busy || blocked || ready !== true} onClick={generate}>{busy ? "作成中…" : "AIで作成"}</button>}
      <button type="button" onClick={onClose}>キャンセル</button>
    </div>
  </dialog>;
}
