import React, { useEffect, useRef, useState } from "react";
import { createTripLink, lineTripLink, SHARE_FIELDS } from "./tripShare.js";
import "./tripShare.css";

export default function TripShare({ plan, onClose }) {
  const [selected, setSelected] = useState(() => Object.fromEntries(SHARE_FIELDS.map(([key, , checked]) => [key, checked])));
  const [plain, setPlain] = useState(false);
  const [url, setUrl] = useState(""); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  const dialog = useRef(null); const link = useRef(null); const timer = useRef(null); const active = useRef(true);
  useEffect(() => {
    active.current = true; const opener = document.activeElement; const node = dialog.current; node.showModal();
    return () => { active.current = false; clearTimeout(timer.current); node.close(); if (opener?.isConnected) opener.focus?.(); };
  }, []);
  function reset() { setUrl(""); setStatus(""); setError(""); setCopied(false); clearTimeout(timer.current); }
  async function generate() {
    setBusy(true); setError("");
    try { const result = await createTripLink(plan, selected, { compress: !plain }); if (active.current) { setUrl(result); setStatus("共有リンクを作りました。"); } }
    catch (e) { if (active.current) setError(e.message || "共有リンクを作れませんでした。"); }
    finally { if (active.current) setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); if (!active.current) return; setCopied(true); setStatus(""); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2800); }
    catch { link.current?.focus(); link.current?.select(); setStatus("自動コピーできませんでした。選択されたリンクを手動でコピーしてください。"); }
  }
  async function share() {
    setBusy(true); setStatus("");
    try { await navigator.share({ title: plan.title, text: "旅図帳で旅行のしおりを共有しました。", url }); }
    catch (e) { if (e.name !== "AbortError" && active.current) setStatus("共有メニューを開けませんでした。リンクコピーをご利用ください。"); }
    finally { if (active.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="trip-ai-dialog trip-share-dialog" aria-labelledby="trip-share-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id="trip-share-title">共有する内容</h2>
    <p>✓ 旅行タイトル　✓ 行き先　✓ 日程　✓ スケジュール</p>
    <p>チェックした内容は共有URLを知っている人が閲覧できます。</p>
    <p className="trip-storage-note">予定名・予定のメモも必ず共有されます。出発地点・最終到着地点は自宅住所などになる可能性があるため初期状態では共有しません。共有してよい場合だけチェックしてください。入力中の内容を使いますが、計画の保存は行いません。</p>
    <fieldset disabled={busy} className="trip-share-checks"><legend>追加で共有する項目</legend>{SHARE_FIELDS.map(([key, label]) => <label key={key}><input type="checkbox" checked={selected[key]} onChange={e => { reset(); setSelected({ ...selected, [key]: e.target.checked }); }} />{label}</label>)}</fieldset>
    <label className="trip-share-compat"><input type="checkbox" disabled={busy} checked={plain} onChange={e => { reset(); setPlain(e.target.checked); }} />圧縮しない互換リンク（古いブラウザ向け）</label>
    <p className="trip-storage-note">リンクは作成時の内容です。編集後は作り直してください。送信済みリンクの内容変更・取り消しはできません。</p>
    <button className="trip-primary" type="button" onClick={generate} disabled={busy}>{busy ? "処理中…" : "共有リンクを作る"}</button>
    {error && <p className="trip-error" role="alert">{error}</p>}
    {url && <section aria-label="共有リンク"><label>共有URL<input ref={link} readOnly value={url} onFocus={e => e.target.select()} /></label>
      {url.length > 8000 && <p role="status">共有内容が多いためリンクが長くなっています。不要な共有項目を外すと短くできます。</p>}
      <div className="trip-ai-actions"><a className="trip-link-button" href={lineTripLink(plan.title, url)} target="_blank" rel="noopener noreferrer">LINEで送る</a>
        {typeof navigator.share === "function" && <button type="button" onClick={share} disabled={busy}>スマホの共有メニュー</button>}
        <button type="button" onClick={copy} disabled={busy}>リンクをコピー</button></div>
    </section>}
    <p role="status">{status}</p><div className={copied ? "trip-toast" : "sr-only"} role="status">{copied ? "✓ 共有リンクをコピーしました" : ""}</div>
    <button type="button" onClick={onClose}>閉じる</button>
  </dialog>;
}
