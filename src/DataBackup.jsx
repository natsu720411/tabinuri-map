import React, { useRef, useState } from "react";
import { TRIP_PLANS_KEY } from "./tripPlans.js";
import { trackEvent } from "./analytics.js";
import "./dataBackup.css";

const MEMORIES_KEY = "tabinuri.prefectureMemories.v1";
const PHOTO_DB = "tabinuri-photos-v1";
const PHOTO_STORE = "photos";
const BACKUP_VERSION = 1;

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllPhotos() {
  return openPhotoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const request = tx.objectStore(PHOTO_STORE).getAll();
    request.onsuccess = () => { resolve(request.result || []); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  }));
}

function replacePhotos(photos) {
  return openPhotoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    const store = tx.objectStore(PHOTO_STORE);
    store.clear();
    for (const photo of photos) {
      const record = { prefectureId: photo.prefectureId, createdAt: photo.createdAt, blob: photo.blob };
      store.add(record);
    }
    tx.oncomplete = () => { resolve(); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
    tx.onabort = () => { reject(tx.error); db.close(); };
  }));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(value) {
  const response = await fetch(value);
  return response.blob();
}

function parsedLocalStorage(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export default function DataBackup({ onRestored }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function exportBackup() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("バックアップを作成しています…");
    try {
      const photos = await getAllPhotos();
      const photoData = await Promise.all(photos.map(async photo => ({
        prefectureId: Number(photo.prefectureId),
        createdAt: Number(photo.createdAt) || Date.now(),
        type: photo.blob?.type || "image/webp",
        dataUrl: await blobToDataUrl(photo.blob),
      })));
      const backup = {
        app: "tabizucho",
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        memories: parsedLocalStorage(MEMORIES_KEY, {}),
        tripPlans: parsedLocalStorage(TRIP_PLANS_KEY, { version: 1, plans: [] }),
        photos: photoData,
      };
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      link.href = url;
      link.download = `tabizucho-backup-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(`バックアップを書き出しました（写真 ${photos.length}枚）。ファイルを大切に保管してください。`);
      trackEvent("data_backup_exported", { result: "success" });
    } catch {
      setError("バックアップを作成できませんでした。ブラウザの保存設定や空き容量をご確認ください。");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    if (!window.confirm("現在の旅図帳データを、選択したバックアップの内容で置き換えます。続けますか？")) return;
    setBusy(true); setError(""); setMessage("バックアップを復元しています…");
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || backup.app !== "tabizucho" || backup.version !== BACKUP_VERSION || !validObject(backup.memories) || !validObject(backup.tripPlans) || !Array.isArray(backup.photos)) {
        throw new Error("invalid backup");
      }
      if (backup.photos.length > 300) throw new Error("too many photos");
      const photos = [];
      for (const photo of backup.photos) {
        if (!Number.isInteger(photo.prefectureId) || photo.prefectureId < 1 || photo.prefectureId > 47 || typeof photo.dataUrl !== "string" || !photo.dataUrl.startsWith("data:image/")) throw new Error("invalid photo");
        const blob = await dataUrlToBlob(photo.dataUrl);
        if (!blob.type.startsWith("image/")) throw new Error("invalid photo type");
        photos.push({ prefectureId: photo.prefectureId, createdAt: Number(photo.createdAt) || Date.now(), blob });
      }
      localStorage.setItem(MEMORIES_KEY, JSON.stringify(backup.memories));
      localStorage.setItem(TRIP_PLANS_KEY, JSON.stringify(backup.tripPlans));
      await replacePhotos(photos);
      setMessage(`復元しました（写真 ${photos.length}枚）。旅図帳のデータを読み直しました。`);
      trackEvent("data_backup_restored", { result: "success" });
      onRestored?.();
    } catch {
      setError("このファイルは旅図帳のバックアップとして読み込めませんでした。現在のデータは変更していません。");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return <section className="data-backup" aria-labelledby="data-backup-title">
    <div className="data-backup-heading">
      <p className="section-kicker">DATA MANAGEMENT</p>
      <h1 id="data-backup-title">データ管理</h1>
      <p>旅図帳の記録はこのブラウザ内に保存されています。機種変更やブラウザのデータ削除に備えて、定期的なバックアップをおすすめします。</p>
    </div>

    <div className="data-backup-grid">
      <article>
        <span className="data-backup-icon" aria-hidden="true">↓</span>
        <h2>バックアップを書き出す</h2>
        <p>旅行計画・都道府県の思い出・保存した写真を、1つのJSONファイルにまとめて保存します。</p>
        <button type="button" className="data-backup-primary" disabled={busy} onClick={exportBackup}>{busy ? "処理中…" : "バックアップを保存"}</button>
      </article>

      <article>
        <span className="data-backup-icon" aria-hidden="true">↑</span>
        <h2>バックアップから復元</h2>
        <p>以前に書き出した旅図帳のバックアップを読み込みます。現在の記録はバックアップの内容で置き換わります。</p>
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>バックアップを選択</button>
        <input ref={input} className="sr-only" type="file" accept="application/json,.json" onChange={importBackup} />
      </article>
    </div>

    <aside className="data-backup-note">
      <strong>大切な記録を守るために</strong>
      <p>バックアップファイルには旅行のメモや写真が含まれます。公開場所には置かず、ご自身で安全に保管してください。バックアップの作成・復元時にファイルを外部サービスへ送信することはありません。</p>
    </aside>

    {message && <p className="data-backup-message" role="status">{message}</p>}
    {error && <p className="data-backup-error" role="alert">{error}</p>}
  </section>;
}
