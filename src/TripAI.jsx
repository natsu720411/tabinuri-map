import React, { useEffect, useRef, useState } from "react";
import { AI_NOTICE, MOODS, PACES, PLAN_FIELDS, validateRequest, validateItinerary } from "../lib/tripItinerary.js";
import { newId } from "./tripPlans.js";
const PREPARING = "AI機能は準備中です。管理者によるAPI設定が必要です。";

export default function TripAI({ plan, blocked, onApply, onClose }) {
  const dialog = useRef(null), controller = useRef(null), busyRef = useRef(false), previewHeading = useRef(null);
  const [mood, setMood] = useState("おまかせ"), [pace, setPace] = useState("普通");
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
    try { request = validateRequest({ mood, pace, plan: Object.fromEntries(["prefectureId", ...PLAN_FIELDS].map(key => [key, plan[key]])) }); }
    catch (err) { setError(err.message); return; }
    busyRef.current = true; setBusy(true); setResult(null);
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 55000);
    try {
      const response = await fetch("/api/generate-trip", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ plan: request.plan, mood, pace }) });
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
    {!result && <><p>行き先・出発日・帰宅日をもとに、1〜14日間の旅程を考えます。</p>
      <p className="trip-ai-disclosure">「AIで作成」を押すと、入力中の計画情報を旅図帳のサーバー経由でGoogle Geminiへ送信します。写真や他の旅行記録は送りません。</p>
      <div className="trip-fields"><label>旅行の雰囲気<select autoFocus disabled={busy} value={mood} onChange={e => setMood(e.target.value)}>{MOODS.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>旅行ペース<select disabled={busy} value={pace} onChange={e => setPace(e.target.value)}>{PACES.map(value => <option key={value}>{value}</option>)}</select></label></div>
      <p>現在の予定は、プレビューで確認して「この旅程を使う」を押した場合だけ置き換わります。</p></>}
    <p role="status">{busy && <><span className="trip-ai-spinner" aria-hidden="true" /> AIが旅のしおりを作成中…</>}</p>
    {error && <p role="alert" className="trip-error">{error}</p>}
    {blocked && <p role="alert">保存データに変更があるため反映できません。一度閉じて画面の案内をご確認ください。</p>}
    {result && <><h3 tabIndex={-1} ref={previewHeading}>AIが作成した旅程</h3>
      {result.days.map((day, index) => <section key={day.id} className="trip-day"><h4>{index + 1}日目 · {day.date}</h4><ol className="trip-ai-items">{day.items.map(item => <li key={item.id}><time>{item.time}</time><strong>{item.name}</strong><p>{item.memo}</p></li>)}</ol></section>)}
      <p>{AI_NOTICE}</p><p>適用後も未保存です。内容を調整して「計画を保存」を押してください。</p></>}
    <div className="trip-ai-actions">
      {result ? <><button type="button" className="trip-primary" disabled={blocked} onClick={() => onApply(result.days)}>この旅程を使う</button><button type="button" onClick={() => { setResult(null); setError(""); }}>やり直す</button></> : <button type="button" className="trip-primary" disabled={busy || blocked || ready !== true} onClick={generate}>{busy ? "作成中…" : "AIで作成"}</button>}
      <button type="button" onClick={onClose}>キャンセル</button>
    </div>
  </dialog>;
}
