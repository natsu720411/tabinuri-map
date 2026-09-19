import React, { useEffect, useRef, useState } from "react";
import { listTravelLogPhotos } from "./travelPhotos.js";

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function wrapLines(ctx, value, maxWidth, maxLines = 2) {
  const source = String(value || "").trim();
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

function drawCoverPhoto(ctx, photo, x, y, width, height) {
  const scale = Math.max(width / photo.width, height / photo.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (photo.width - sourceWidth) / 2;
  const sourceY = (photo.height - sourceHeight) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 28);
  ctx.clip();
  ctx.drawImage(photo, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
}

function tripDayCount(plan) {
  if (Array.isArray(plan.days) && plan.days.length) return plan.days.length;
  if (!plan.startDate || !plan.endDate) return 0;
  const start = new Date(`${plan.startDate}T00:00:00`);
  const end = new Date(`${plan.endDate}T00:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff + 1 : 0;
}

export async function createTravelSummaryImage({ plan, summary, photo = null }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作成できませんでした。");

  ctx.fillStyle = "#f2f6f1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 48, 48, 984, 1254, 38);

  ctx.fillStyle = "#527f61";
  ctx.font = "700 27px system-ui, sans-serif";
  ctx.fillText("TABIZUCHO · TRIP MEMORY", 92, 116);

  ctx.fillStyle = "#293f36";
  ctx.font = "800 52px system-ui, sans-serif";
  const titleLines = wrapLines(ctx, plan.title || "旅の記録", 850, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, 92, 188 + index * 60));

  const titleOffset = titleLines.length > 1 ? 60 : 0;
  const dateRange = plan.startDate || plan.endDate
    ? `${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`
    : "日程未設定";
  ctx.fillStyle = "#65766b";
  ctx.font = "600 24px system-ui, sans-serif";
  ctx.fillText(dateRange, 92, 250 + titleOffset);

  let contentY = 292 + titleOffset;
  if (photo) {
    drawCoverPhoto(ctx, photo, 92, contentY, 896, 330);
    contentY += 366;
  }

  const days = tripDayCount(plan);
  const stats = [
    [days || summary.days.length, "日間"],
    [summary.placeCount, "訪れた場所"],
    [summary.photoCount, "写真"],
    [summary.entries.length, "旅ログ"],
  ];

  const gap = 12;
  const boxWidth = (896 - gap * 3) / 4;
  stats.forEach(([value, label], index) => {
    const x = 92 + index * (boxWidth + gap);
    ctx.fillStyle = "#edf4ee";
    roundedRect(ctx, x, contentY, boxWidth, 118, 20);
    ctx.fillStyle = "#427859";
    ctx.font = "800 36px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(value), x + boxWidth / 2, contentY + 51);
    ctx.fillStyle = "#65766b";
    ctx.font = "700 17px system-ui, sans-serif";
    ctx.fillText(label, x + boxWidth / 2, contentY + 84);
  });
  ctx.textAlign = "left";

  const spots = [...new Set(summary.entries.map(entry => entry.name?.trim()).filter(Boolean))].slice(0, photo ? 4 : 6);
  const spotsY = contentY + 160;
  ctx.fillStyle = "#293f36";
  ctx.font = "800 29px system-ui, sans-serif";
  ctx.fillText("旅の足あと", 92, spotsY);

  if (spots.length) {
    spots.forEach((spot, index) => {
      const y = spotsY + 54 + index * 56;
      ctx.fillStyle = "#e9f3eb";
      ctx.beginPath();
      ctx.arc(108, y - 8, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#293f36";
      ctx.font = "700 24px system-ui, sans-serif";
      const line = wrapLines(ctx, spot, 800, 1)[0] || spot;
      ctx.fillText(line, 134, y);
    });
  } else {
    ctx.fillStyle = "#65766b";
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText("旅ログはまだありません。", 92, spotsY + 50);
  }

  ctx.fillStyle = "#527f61";
  ctx.font = "800 31px system-ui, sans-serif";
  ctx.fillText("旅図帳", 92, 1238);

  ctx.fillStyle = "#7a8c82";
  ctx.font = "500 20px system-ui, sans-serif";
  ctx.fillText("旅の思い出を、日本地図に。", 92, 1273);
  ctx.textAlign = "right";
  ctx.fillText("tabinuri-map.vercel.app", 988, 1273);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("画像を作成できませんでした。")),
      "image/png"
    );
  });
}

export default function TravelSummaryShare({ plan, summary }) {
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

  async function render(photoBlob, label = "") {
    let bitmap = null;
    try {
      if (photoBlob) bitmap = await createImageBitmap(photoBlob);
      const blob = await createTravelSummaryImage({ plan, summary, photo: bitmap });
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
    setBusy(true);
    setStatus("");
    try {
      let savedPhoto = null;
      try {
        const rows = await listTravelLogPhotos({ planId: plan.id });
        savedPhoto = rows[0]?.blob || null;
      } catch {}
      await render(savedPhoto, savedPhoto ? "旅行中に保存した写真を代表写真にしています。" : "");
    } catch (error) {
      setStatus(error.message || "旅のまとめ画像を作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto(file) {
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      if (/\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type)) {
        throw new Error("HEIC・HEIF形式には対応していません。JPEGやPNGなどを選んでください。");
      }
      if (!file.type.startsWith("image/")) throw new Error("写真ファイルを選んでください。");
      await render(file, "選んだ写真を代表写真にしています。");
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
      await render(null, "");
      setStatus("写真なしの記念カードに変更しました。");
    } catch (error) {
      setStatus(error.message || "画像を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function shareImage() {
    if (!image) return;
    const file = new File([image.blob], "tabizucho-trip-memory.png", { type: "image/png" });
    setBusy(true);
    setStatus("");
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${plan.title || "旅の記録"}｜旅図帳`,
          text: "旅の思い出を旅図帳でまとめました。",
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

  return <div className="travel-summary-share">
    <button type="button" className="travel-summary-share-button" onClick={generate} disabled={busy}>
      {busy ? "記念カードを作成中…" : "旅のまとめを画像で共有"}
    </button>
    {status && !image && <p className="travel-summary-share-status" role="status">{status}</p>}

    {image && <dialog ref={dialog} className="travel-summary-share-dialog" aria-labelledby="travel-summary-share-title" onCancel={event => { event.preventDefault(); close(); }}>
      <h2 id="travel-summary-share-title">旅の記念カード</h2>
      <img src={image.url} alt={`${plan.title || "旅行"}の旅のまとめ画像`} width="1080" height="1350" />
      {photoLabel && <p className="travel-summary-share-photo-status">{photoLabel}</p>}
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) changePhoto(file);
      }} />

      <div className="travel-summary-photo-actions">
        <button type="button" onClick={() => photoInput.current?.click()} disabled={busy}>{photoLabel ? "代表写真を変更" : "代表写真を追加"}</button>
        {photoLabel && <button type="button" onClick={removePhoto} disabled={busy}>写真なしにする</button>}
      </div>

      <p>旅行全体の記録を1枚にまとめています。選んだ写真は共有画像にだけ使われ、新たに旅行記録へ保存されません。</p>
      <div className="travel-summary-share-actions">
        <a href={image.url} download="tabizucho-trip-memory.png">PNG画像を保存</a>
        <button type="button" className="travel-primary" onClick={shareImage} disabled={busy}>{busy ? "処理中…" : "画像を共有"}</button>
        <button type="button" onClick={close}>閉じる</button>
      </div>
      <p className="travel-summary-share-status" role="status">{status}</p>
    </dialog>}
  </div>;
}
