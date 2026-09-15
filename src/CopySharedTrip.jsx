import React, { useEffect, useRef, useState } from "react";
import prefectures from "./prefectures.json";
import { copySharedPlan, openCopiedPlan } from "./tripImportShared.js";

export default function CopySharedTrip({ plan, onClose }) {
  const dialog = useRef(null); const saving = useRef(false); const active = useRef(true);
  const [title, setTitle] = useState(plan.title); const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    active.current = true; const opener = document.activeElement; const node = dialog.current; node.showModal();
    return () => { active.current = false; node.close(); if (opener?.isConnected) opener.focus?.(); };
  }, []);
  async function submit(event) {
    event.preventDefault(); if (saving.current || result) return;
    saving.current = true; setBusy(true); setError("");
    try { const copied = await copySharedPlan(plan, title); if (active.current) setResult(copied); }
    catch (e) { if (active.current) setError(e.message || "コピーできませんでした。ブラウザを更新してお試しください。"); }
    finally { saving.current = false; if (active.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="trip-copy-dialog" aria-labelledby="copy-shared-title" onCancel={e => { e.preventDefault(); if (!saving.current) onClose(); }}>
    <h2 id="copy-shared-title">このしおりをコピー</h2>
    <p>この旅行をあなたの「旅の計画」に保存します。コピー後は自由に日程や予定を編集できます。元のしおりや送信者のデータは変更されません。</p>
    <p>{prefectures.find(p => p.id === plan.prefectureId)?.name}<br />{plan.startDate || "出発日未定"} 〜 {plan.endDate || "帰宅日未定"}</p>
    <p>このブラウザに保存します。訪問済みや思い出への追加は行いません。</p>
    {!result ? <form onSubmit={submit}><label>旅行タイトル<input required maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label><button type="submit" className="trip-link-button" disabled={busy}>{busy ? "コピー中…" : "旅の計画にコピーする"}</button></form> : <>
      <p role="status">{result.already ? "このしおりはすでに旅の計画にコピーされています" : "✓ 旅の計画にコピーしました"}</p>
      <button className="trip-link-button" type="button" onClick={() => { try { openCopiedPlan(result.plan.id); } catch { setError("画面を開けませんでした。通常の旅図帳の「旅の計画」から開いてください。"); } }}>{result.already ? "コピー済みの計画を開く" : "コピーした計画を開く"}</button>
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={onClose}>閉じる</button>
  </dialog>;
}
