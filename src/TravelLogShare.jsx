import React, { useEffect, useRef, useState } from "react";
import { listTravelLogPhotos } from "./travelPhotos.js";

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const source = String(text || "").trim();
  if (!source) return [];
  const lines = [];
  let current = "";
  for (const char of source) {
    const next = current + char;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = char;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const joined = lines.join("");
  if (joined.length < source.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = last + "…";
  }
  return lines;
}

function formatDayLabel(dayLabel, dayDate) {
  if (dayDate) {
    try {
      return new Date(`${dayDate}T00:00:00`).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {}
  }
  return dayLabel || "旅の1日";
}

function drawCoverPhoto(ctx, photo, x, y, width, height) {
  const scale = Math.max(width / photo.width, height / photo.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (photo.width - sourceWidth) / 2;
  const sourceY = (photo.height - sourceHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.clip();
  ctx.drawImage(photo, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
}

export async function createTravelLogImage({ title, dayLabel, dayDate, entries, photo = null }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作成できませんでした。");

  ctx.fillStyle = "#f3f6f1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 48, 48, 984, 1254, 36);

  ctx.fillStyle = "#527f61";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.fillText("TABIZUCHO · TRAVEL LOG", 92, 120);

  ctx.fillStyle = "#293f36";
  ctx.font = "800 48px system-ui, sans-serif";
  const titleLines = wrapLines(ctx, title || "旅の記録", 850, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, 92, 190 + index * 58));

  const titleOffset = titleLines.length > 1 ? 58 : 0;
  ctx.fillStyle = "#65766b";
  ctx.font = "600 25px system-ui, sans-serif";
  ctx.fillText(formatDayLabel(dayLabel, dayDate), 92, 252 + titleOffset);

  ctx.fillStyle = "#e8f0e9";
  roundedRect(ctx, 92, 292 + titleOffset, 896, 2, 1);

  let y;
  let visibleEntries;
  let rowHeight;

  if (photo) {
    const photoY = 322 + titleOffset;
    drawCoverPhoto(ctx, photo, 92, photoY, 896, 280);
    y = photoY + 320;
    visibleEntries = entries.slice(0, 5);
    rowHeight = 94;
  } else {
    y = 340 + titleOffset;
    visibleEntries = entries.slice(0, 9);
    rowHeight = visibleEntries.length <= 6 ? 112 : 96;
  }

  visibleEntries.forEach(entry => {
    const time = entry.at
      ? new Date(entry.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
      : "--:--";

    ctx.fillStyle = "#edf4ee";
    roundedRect(ctx, 92, y - 10, 896, rowHeight - 10, 22);

    ctx.fillStyle = "#427859";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillText(time, 120, y + 28);

    ctx.fillStyle = "#83a98d";
    ctx.beginPath();
    ctx.arc(245, y + 18, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#293f36";
    ctx.font = "800 30px system-ui, sans-serif";
    const nameLines = wrapLines(ctx, entry.name, 600, 1);
    ctx.fillText(nameLines[0] || "記録", 280, y + 25);

    ctx.fillStyle = "#65766b";
    ctx.font = "600 20px system-ui, sans-serif";
    const meta = [entry.kind, entry.photoCount > 0 ? `📷 ${entry.photoCount}枚` : ""].filter(Boolean).join(" · ");
    if (meta) ctx.fillText(meta, 280, y + 58);

    if (!photo && entry.memo && visibleEntries.length <= 6) {
      ctx.fillStyle = "#566b60";
      ctx.font = "500 20px system-ui, sans-serif";
      const memo = wrapLines(ctx, `「${entry.memo}」`, 650, 1)[0];
      if (memo) ctx.fillText(memo, 280, y + 85);
    }

    y += rowHeight;
  });

  if (entries.length > visibleEntries.length) {
    ctx.fillStyle = "#65766b";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(`ほか ${entries.length - visibleEntries.length}件の旅ログ`, 120, Math.min(y + 24, 1190));
  }

  ctx.fillStyle = "#527f61";
  ctx.font = "800 30px system-ui, sans-serif";
  ctx.fillText("旅図帳", 92, 1240);

  ctx.fillStyle = "#7a8c82";
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("tabinuri-map.vercel.app", 92, 1276);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("画像を作成できませんでした。")),
      "image/png"
    );
  });
}

export default function TravelLogShare({ title, dayLabel, dayDate, entries, planId = "" }) {
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [photoLabel, setPhotoLabel] = useState("");
  const dialog = useRef(null);
  const photoInput = useRef(null);
  const open = Boolean(image);

  useEffect(() => () => {
    if (image?.url) URL.revokeObjectURL(image.url);
  }, []);

  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  async function renderWithPhoto(photoBlob, label = "") {
    let bitmap = null;
    try {
      if (photoBlob) bitmap = await createImageBitmap(photoBlob);
      const blob = await createTravelLogImage({ title, dayLabel, dayDate, entries, photo: bitmap });
      setImage(previous => {
        if (previous?.url) URL.revokeObjectURL(previous.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
      setPhotoLabel(label);
    } finally {
      bitmap?.close();
    }
  }

  async function generate() {
    if (!entries.length) {
      setStatus("旅ログを1件以上記録してから画像を作成してください。");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      let savedPhoto = null;
      if (planId) {
        try {
          const rows = await listTravelLogPhotos({ planId, entryIds: entries.map(entry => entry.id) });
          savedPhoto = rows[0]?.blob || null;
        } catch {}
      }
      await renderWithPhoto(savedPhoto, savedPhoto ? "この日に旅図帳へ保存した写真を入れています。" : "");
    } catch (error) {
      setStatus(error.message || "画像を作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function updatePhoto(file) {
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      if (/\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type)) {
        throw new Error("HEIC・HEIF形式には対応していません。JPEGやPNGなどを選んでください。");
      }
      if (!file.type.startsWith("image/")) throw new Error("写真ファイルを選んでください。");
      await renderWithPhoto(file, "選んだ写真を共有画像に入れています。");
    } catch (error) {
      setStatus(error.message || "写真を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    setStatus("");
    try {
      await renderWithPhoto(null, "");
      setStatus("写真なしの旅ログ画像に変更しました。");
    } catch (error) {
      setStatus(error.message || "画像を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    if (!image) return;
    const file = new File([image.blob], "tabizucho-travel-log.png", { type: "image/png" });
    setBusy(true);
    setStatus("");
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${title || "旅の記録"}｜旅図帳`,
          text: "今日の旅ログを旅図帳でまとめました。",
        });
      } else {
        setStatus("この端末では画像共有に対応していません。PNG画像を保存して共有してください。");
      }
    } catch (error) {
      if (error.name !== "AbortError") setStatus("共有画面を開けませんでした。PNG画像を保存して共有してください。");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (image?.url) URL.revokeObjectURL(image.url);
    setImage(null);
    setStatus("");
    setPhotoLabel("");
  }

  return <>
    <button type="button" className="travel-log-share-button" onClick={generate} disabled={busy || !entries.length}>
      {busy ? "画像を作成中…" : "旅ログを画像で共有"}
    </button>
    {status && !image && <p className="travel-log-share-status" role="status">{status}</p>}
    {image && <dialog ref={dialog} className="travel-log-share-dialog" aria-labelledby="travel-log-share-title" onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="travel-log-share-title">旅ログを画像で共有</h2>
      <img src={image.url} alt={`${title || "旅行"}の${dayLabel || "旅ログ"}共有画像`} width="1080" height="1350" />
      {photoLabel && <p className="travel-log-share-photo-status">{photoLabel}</p>}
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) updatePhoto(file);
      }} />
      <div className="travel-log-photo-actions">
        <button type="button" onClick={() => photoInput.current?.click()} disabled={busy}>{photoLabel ? "写真を変更" : "写真を追加"}</button>
        {photoLabel && <button type="button" onClick={removePhoto} disabled={busy}>写真なしにする</button>}
      </div>
      <p>LINEなどへ送る場合は「画像を共有」を押してください。選んだ写真は共有画像にだけ使われ、新たに旅行記録へ保存されません。</p>
      <div className="travel-log-share-actions">
        <a href={image.url} download="tabizucho-travel-log.png">PNG画像を保存</a>
        <button type="button" className="travel-primary" onClick={shareImage} disabled={busy}>{busy ? "処理中…" : "画像を共有"}</button>
        <button type="button" onClick={close}>閉じる</button>
      </div>
      <p className="travel-log-share-status" role="status">{status}</p>
    </dialog>}
  </>;
}
