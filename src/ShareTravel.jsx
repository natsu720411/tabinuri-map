import ShareImage from "./ShareImage.jsx";
import React, { useRef, useState } from "react";
import { createShareText, SHARE_URL } from "./share.js";

export default function ShareTravel({ count, total, visited, records }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const preview = useRef(null);
  const text = createShareText(count, total);
  const fullText = `${text}\n\n${SHARE_URL}`;
  const intent = `https://twitter.com/intent/tweet?${new URLSearchParams({ text, url: SHARE_URL })}`;

  async function share() {
    setStatus("");
    if (typeof navigator.share !== "function") {
      setOpen(previous => !previous);
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ title: "タビヌリの旅の記録", text, url: SHARE_URL });
    } catch (error) {
      if (error.name !== "AbortError") {
        setOpen(true);
        setStatus("標準の共有画面を開けませんでした。以下から共有できます。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setStatus("");
    try {
      await navigator.clipboard.writeText(fullText);
      setStatus("コピーしました");
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setStatus("自動コピーできませんでした。選択された共有文をコピーしてください。");
    }
  }

  return <div className="travel-share">
    <button type="button" className="share-primary" onClick={share} disabled={busy} aria-expanded={open} aria-controls="travel-share-options">旅の記録をシェア</button>
    <button type="button" className="share-alternative" onClick={() => { setOpen(previous => !previous); setStatus(""); }} aria-expanded={open} aria-controls="travel-share-options">X・コピーで共有</button>
    <ShareImage visited={visited} records={records} onTextShare={() => { setOpen(true); setStatus("画像の代わりに共有文を使えます。"); }} />
    {open && <div id="travel-share-options" className="share-options">
      <label htmlFor="travel-share-text">共有する内容</label>
      <textarea ref={preview} id="travel-share-text" readOnly value={fullText} rows={8} />
      <div className="share-actions">
        <a href={intent} target="_blank" rel="noopener noreferrer">Xで共有</a>
        <button type="button" onClick={copy}>共有文をコピー</button>
        <button type="button" onClick={() => { setOpen(false); setStatus(""); }}>閉じる</button>
      </div>
    </div>}
    <p className="share-status" role="status">{status}</p>
  </div>;
}
