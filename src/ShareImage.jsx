import { getShareTopThree } from "./shareRanking.js";
import React, { useEffect, useRef, useState } from "react";
import prefectures from "./prefectures.json";
import { createShareText, SHARE_URL } from "./share.js";

export async function createTravelImage(visited, photo = null, topThree = []) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const ids = new Set(visited);
  const count = prefectures.filter(p => ids.has(p.id)).length;
  ctx.fillStyle = "#f8f9f5"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(24, 24, 1152, 582);
  ctx.fillStyle = "#427859"; ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText("タビヌリ", 64, 110);
  ctx.fillStyle = "#293f36"; ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.fillText(`47都道府県中 ${count}県訪問`, 64, 225);
  ctx.fillStyle = "#527f61"; ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText(count === 47 ? "47都道府県制覇！" : `全国制覇まであと${47-count}県`, 64, 285);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(count === 0 ? "これから日本全国を旅しよう" : "旅の思い出を、日本地図に。", 64, 350);
  ctx.fillStyle = "#edf0e9"; ctx.fillRect(64, 395, 410, 12);
  ctx.fillStyle = "#638e71"; ctx.fillRect(64, 395, 410 * count / 47, 12);
  ctx.font = '20px system-ui, sans-serif'; ctx.fillText("tabinuri-map.vercel.app", 64, 550);
  if (topThree.length) {
    ctx.fillStyle = "#f1f6ef";
    ctx.beginPath(); ctx.roundRect(64, 422, 410, 30 + topThree.length * 26, 12); ctx.fill();
    ctx.fillStyle = "#527f61"; ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText("お気に入り県", 78, 444);
    topThree.forEach((prefecture, index) => {
      const y = 470 + index * 26;
      ctx.fillStyle = "#293f36"; ctx.font = '18px system-ui, sans-serif';
      ctx.fillText((index + 1) + ". " + prefecture.name, 78, y);
      ctx.fillStyle = "#a17a32";
      ctx.fillText("★".repeat(prefecture.rating) + "☆".repeat(5 - prefecture.rating), 310, y);
    });
  }
  // Measure the existing map paths so outlying islands remain inside the image.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:0;height:0";
  svg.setAttribute("aria-hidden", "true");
  for (const p of prefectures) {
    const path = document.createElementNS(ns, "path"); path.setAttribute("d", p.d); svg.append(path);
  }
  document.body.append(svg);
  let bounds;
  try { bounds = svg.getBBox(); } finally { svg.remove(); }
  if (!bounds.width || !bounds.height) throw new Error("Map bounds unavailable");
  const mapHeight = photo ? 270 : 490;
  const scale = Math.min(600 / bounds.width, mapHeight / bounds.height);
  ctx.save();
  ctx.translate(540 + (600 - bounds.width * scale) / 2, 60 + (mapHeight - bounds.height * scale) / 2);
  ctx.scale(scale, scale); ctx.translate(-bounds.x, -bounds.y);
  for (const p of prefectures) {
    const path = new Path2D(p.d);
    ctx.fillStyle = ids.has(p.id) ? "#638e71" : "#e0e5dc";
    ctx.fill(path); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1 / scale; ctx.stroke(path);
  }
  ctx.restore();
  if (photo) {
    const x = 540, y = 350, width = 600, height = 220;
    const scale = Math.max(width / photo.width, height / photo.height);
    const sw = width / scale, sh = height / scale;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, y, width, height, 20); ctx.clip();
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, x, y, width, height);
    ctx.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG generation failed")), "image/png"));
}

function ImagePreview({ image, onClose, onTextShare }) {
  const dialog = useRef(null);
  const photoInput = useRef(null);
  const mounted = useRef(false);
  const [rendered, setRendered] = useState(image);
  const [hasPhoto, setHasPhoto] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { if (rendered.url !== image.url) URL.revokeObjectURL(rendered.url); }, [rendered, image.url]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  async function updatePhoto(file) {
    setStatus(""); setBusy(true);
    let bitmap;
    try {
      if (file) {
        if (/\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type)) {
          throw new Error("HEIC・HEIF形式には対応していません。JPEGやPNGに変換して選んでください。");
        }
        if (!file.type.startsWith("image/")) throw new Error("JPEG・PNG・WebPなどの写真を選んでください。");
        try { bitmap = await createImageBitmap(file); }
        catch { throw new Error("写真を読み込めませんでした。JPEGやPNGなど別の画像でお試しください。"); }
      }
      const blob = await createTravelImage(image.visited, bitmap, image.topThree);
      if (!mounted.current) return;
      setRendered({ ...image, blob, url: URL.createObjectURL(blob) });
      setHasPhoto(Boolean(file));
      setStatus(file ? "写真を追加しました" : "写真を削除しました");
    } catch (error) {
      if (mounted.current) setStatus(error.message || "画像を生成できませんでした。もう一度お試しください。");
    } finally {
      bitmap?.close();
      if (mounted.current) setBusy(false);
    }
  }
  async function share() {
    const file = new File([rendered.blob], "tabinuri-travel.png", { type: "image/png" });
    setStatus(""); setBusy(true);
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "タビヌリの旅の記録", text: createShareText(image.count), url: SHARE_URL });
      } else { onTextShare(); }
    } catch (error) {
      if (error.name !== "AbortError") setStatus("画像を共有できませんでした。画像を保存するか、テキストで共有してください。");
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="share-image-dialog" aria-labelledby="share-image-title" onCancel={e => { e.preventDefault(); onClose(); }}>
    <h2 id="share-image-title">旅の記録の共有画像</h2>
    <img src={rendered.url} alt={`タビヌリ：47都道府県中${image.count}県訪問の日本地図`} width="1200" height="630" />
    <p className="share-photo-note">写真はこの共有画像にだけ使われ、旅行記録には保存されません。</p>
    <input ref={photoInput} type="file" accept="image/*" hidden onChange={event => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) updatePhoto(file);
    }} />
    <div className="share-actions">
      <button type="button" onClick={() => photoInput.current?.click()} disabled={busy}>{hasPhoto ? "写真を変更" : "写真を追加"}</button>
      {hasPhoto && <button type="button" onClick={() => updatePhoto(null)} disabled={busy}>写真を削除</button>}
    </div>
    <div className="share-actions">
      {busy ? <span>処理中…</span> : <a href={rendered.url} download="tabinuri-travel.png">画像を保存</a>}
      <button type="button" onClick={share} disabled={busy}>共有</button>
      <button type="button" onClick={onTextShare}>テキストで共有</button>
      <button type="button" onClick={onClose} autoFocus>閉じる</button>
    </div>
    <p role="status">{status}</p>
  </dialog>;
}

export default function ShareImage({ visited, records, onTextShare }) {
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  async function generate() {
    setBusy(true); setError("");
    try {
      const snapshot = [...visited];
      const topThree = getShareTopThree(records, prefectures);
      const blob = await createTravelImage(snapshot, null, topThree);
      setImage({ blob, url: URL.createObjectURL(blob), count: snapshot.length, visited: snapshot, topThree });
    } catch { setError("画像を生成できませんでした。もう一度お試しください。"); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="share-alternative" onClick={generate} disabled={busy}>{busy ? "画像を作成中…" : "共有画像を作る"}</button>
    {error && <p role="alert" className="share-status">{error}</p>}
    {image && <ImagePreview image={image} onClose={() => setImage(null)} onTextShare={() => { setImage(null); onTextShare(); }} />}
  </>;
}
