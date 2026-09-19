const PHOTO_DB = "tabinuri-photos-v1";
const PHOTO_STORE = "photos";
export const MAX_PREFECTURE_PHOTOS = 5;

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PHOTO_STORE)) {
        request.result.createObjectStore(PHOTO_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function photoRequest(mode, action) {
  return openPhotoDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, mode);
    const request = action(tx.objectStore(PHOTO_STORE));
    request.onsuccess = () => {
      resolve(request.result);
      db.close();
    };
    request.onerror = () => {
      reject(request.error);
      db.close();
    };
  }));
}

export async function countPrefecturePhotos(prefectureId) {
  const rows = await photoRequest("readonly", store => store.getAll());
  return rows.filter(row => row.prefectureId === prefectureId).length;
}

export function saveTravelPhoto({ prefectureId, planId, dayId, itemId, blob }) {
  return photoRequest("readwrite", store => store.add({
    prefectureId,
    planId,
    dayId,
    itemId,
    source: "travel-mode",
    blob,
    createdAt: Date.now(),
  }));
}

export async function listTravelLogPhotos({ planId, entryIds = [] }) {
  if (!planId) return [];
  const wanted = new Set(entryIds.filter(Boolean).map(id => String(id).replace(/^(?:item|stop):/, "")));
  const rows = await photoRequest("readonly", store => store.getAll());
  return rows
    .filter(row => row.planId === planId && row.blob && (!wanted.size || wanted.has(String(row.itemId || ""))))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function compressTravelPhoto(file) {
  if (!file?.type?.startsWith("image/") || /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "")) {
    throw new Error("この画像形式には対応していません。JPEG、PNG、WebPなどを選択してください。");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。")),
      "image/webp",
      0.84
    );
  });
}
