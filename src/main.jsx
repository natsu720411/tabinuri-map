import TripPlans from "./TripPlans.jsx";
import SharedTrip from "./SharedTrip.jsx";
import { importedIds, mergeTripMemory, normalizeTravelLogs } from "./tripMemory.js";
import { getTravelAchievement } from "./achievement.js";
import ShareTravel from "./ShareTravel.jsx";
import TravelLogShare from "./TravelLogShare.jsx";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import prefectures from "./prefectures.json";
function Icon({ name, ...props }) {
  const shapes = {
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    map: (
      <>
        <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" />
        <path d="M9 3v16M15 5v16" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h4l2-3h4l2 3h4v13H4Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    pen: (
      <>
        <path d="m5 16-1 4 4-1L20 7l-3-3L5 16ZM14 7l3 3M12 20h8" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {shapes[name]}
    </svg>
  );
}
const STORAGE_KEY = "tabinuri.prefectureMemories.v1";
const LEGACY_KEY = "tabinuri.visitedPrefectures.v1";
const validIds = new Set(prefectures.map(({ id }) => id));
const emptyMemory = { visited: false, visitDate: "", memory: "", favorite: false, wantToVisit: false, rating: 0, companions: "", municipalities: "", foods: "", recommendedSpots: "", wantToVisitReason: "", wantToVisitPlaces: "", travelLogs: [] };
const PHOTO_DB = "tabinuri-photos-v1";
const PHOTO_STORE = "photos";
const MAX_PHOTOS = 5;
const REGIONS = [
  ["北海道", [1]],
  ["東北", [2, 3, 4, 5, 6, 7]],
  ["関東", [8, 9, 10, 11, 12, 13, 14]],
  ["中部", [15, 16, 17, 18, 19, 20, 21, 22, 23, 24]],
  ["近畿", [25, 26, 27, 28, 29, 30]],
  ["中国", [31, 32, 33, 34, 35]],
  ["四国", [36, 37, 38, 39]],
  ["九州・沖縄", [40, 41, 42, 43, 44, 45, 46, 47]],
];
function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function photoRequest(mode, action) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, mode);
    const request = action(tx.objectStore(PHOTO_STORE));
    request.onsuccess = () => { resolve(request.result); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}
const listPhotos = (prefectureId) => photoRequest("readonly", store => store.indexNames.contains("prefectureId") ? store.index("prefectureId").getAll(prefectureId) : store.getAll()).then(rows => rows.filter(row => row.prefectureId === prefectureId));
const savePhoto = photo => photoRequest("readwrite", store => store.add(photo));
const deletePhoto = id => photoRequest("readwrite", store => store.delete(id));
async function compressImage(file) {
  if (!file.type.startsWith("image/") || /heic|heif/i.test(file.type) || /.hei[cf]$/i.test(file.name)) throw new Error("この画像形式には対応していません。JPEG、PNG、WebPなどを選択してください。");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。")), "image/webp", 0.84));
}
function readVisits() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const records = {};
    if (raw !== null) {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid records");
      for (const [id, entry] of Object.entries(data)) {
        if (!validIds.has(Number(id)) || !entry || typeof entry !== "object") continue;
        records[Number(id)] = {
          visited: entry.visited === true,
          importedTripPlanIds: importedIds(entry.importedTripPlanIds),
          visitDate: typeof entry.visitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.visitDate) ? entry.visitDate : "",
          memory: typeof entry.memory === "string" ? entry.memory : "",
          favorite: entry.favorite === true,
          wantToVisit: entry.wantToVisit === true,
          rating: Number.isInteger(entry.rating) ? Math.min(5, Math.max(0, entry.rating)) : 0,
          companions: typeof entry.companions === "string" ? entry.companions : "",
          municipalities: typeof entry.municipalities === "string" ? entry.municipalities : "",
          foods: typeof entry.foods === "string" ? entry.foods : "",
          recommendedSpots: typeof entry.recommendedSpots === "string" ? entry.recommendedSpots : "",
          wantToVisitReason: typeof entry.wantToVisitReason === "string" ? entry.wantToVisitReason : "",
          wantToVisitPlaces: typeof entry.wantToVisitPlaces === "string" ? entry.wantToVisitPlaces : "",
          travelLogs: normalizeTravelLogs(entry.travelLogs),
        };
      }
    } else {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
      if (Array.isArray(legacy)) for (const id of legacy) {
        if (validIds.has(Number(id))) records[Number(id)] = { ...emptyMemory, visited: true };
      }
    }
    return { records, error: "" };
  } catch {
    return { records: {}, error: "保存データを読み込めませんでした。既存データを保護するため保存を停止しています。ブラウザーの保存データを確認して再読み込みしてください。" };
  }
}
function MemoryPanel({ prefecture, record, onSave, onClose, readError }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => ({ ...emptyMemory, ...record }));
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  useEffect(() => { listPhotos(prefecture.id).then(setPhotos).catch(() => setError("写真を読み込めませんでした。")); }, [prefecture.id]);
  useEffect(() => () => photos.forEach(photo => photo.url && URL.revokeObjectURL(photo.url)), [photos]);
  async function addPhotos(event) {
    const files = [...event.target.files]; event.target.value = "";
    if (photos.length >= MAX_PHOTOS) return setError("この県には写真を5枚まで保存できます。");
    setPhotoBusy(true); setError("");
    try {
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        const blob = await compressImage(file);
        await savePhoto({ prefectureId: prefecture.id, blob, createdAt: Date.now() });
      }
      const rows = await listPhotos(prefecture.id); setPhotos(rows);
      if (files.length > MAX_PHOTOS - rows.length) setError("保存できる写真は1県につき最大5枚です。");
    } catch (photoError) { setError(photoError.message || "写真を保存できませんでした。"); }
    finally { setPhotoBusy(false); }
  }
  async function removePhoto(id) { try { await deletePhoto(id); setPhotos(await listPhotos(prefecture.id)); setPreview(null); } catch { setError("写真を削除できませんでした。"); } }
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener instanceof Element && opener.isConnected) opener.focus?.();
    };
  }, []);
  function submit(event) {
    event.preventDefault();
    const result = onSave(prefecture.id, draft);
    if (result) setError(result);
    else onClose();
  }
  return <dialog ref={dialog} className="memory-dialog" aria-labelledby="memory-panel-title" aria-describedby="memory-panel-help" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={submit}>
      <div className="panel-heading"><div><p className="section-kicker">MY TRAVEL MEMORY</p><h2 id="memory-panel-title">{prefecture.name}の思い出</h2></div><button type="button" className="panel-close" onClick={onClose} autoFocus>閉じる</button></div>
      <p id="memory-panel-help">訪問日や、忘れたくない出来事を残しましょう。
変更は「保存する」で反映されます。閉じると未保存の変更は破棄されます。</p>
      <div className="panel-section"><h3 className="panel-section-title">基本情報</h3>
      <label className="visit-switch"><input type="checkbox" checked={draft.visited} onChange={event => setDraft(previous => ({ ...previous, visited: event.target.checked }))} />訪問済み<span>{draft.visited ? "訪問済み" : "未訪問"}</span></label>
      <button type="button" className={`favorite-toggle${draft.favorite ? " active" : ""}`} aria-pressed={draft.favorite} aria-label={`${prefecture.name}を${draft.favorite ? "お気に入りから外す" : "お気に入りに追加"}`} onClick={() => setDraft(previous => ({ ...previous, favorite: !previous.favorite }))}>★ <span>{draft.favorite ? "お気に入り" : "お気に入りに追加"}</span></button>
      <fieldset className="rating-field"><legend>お気に入り度</legend><div className="rating-stars">{[1,2,3,4,5].map(value => <button key={value} type="button" className={value <= draft.rating ? "selected" : ""} aria-label={`${value}つ星に設定`} aria-pressed={draft.rating === value} onClick={() => setDraft(previous => ({ ...previous, rating: value }))}>★</button>)}</div></fieldset>
      <label htmlFor="visit-date">訪問日</label>
      <input id="visit-date" type="date" value={draft.visitDate} onChange={event => setDraft(previous => ({ ...previous, visitDate: event.target.value }))} />
      </div>
      <div className="panel-section"><h3 className="panel-section-title">思い出</h3>
      <label htmlFor="memory-text">思い出の文章</label>
      <textarea id="memory-text" rows="5" placeholder="出会った景色、おいしかったもの、旅の思い出…" value={draft.memory} onChange={event => setDraft(previous => ({ ...previous, memory: event.target.value }))} />
      <div className="photo-section"><div className="photo-section-heading"><label>旅の写真</label><span>{photos.length} / {MAX_PHOTOS}枚</span></div>
        <label className={`photo-add${photoBusy || photos.length >= MAX_PHOTOS ? " disabled" : ""}`}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple disabled={photoBusy || photos.length >= MAX_PHOTOS} onChange={addPhotos} />{photoBusy ? "保存中…" : photos.length >= MAX_PHOTOS ? "5枚保存済み" : "＋ 写真を追加"}</label>
        {photos.length > 0 && <div className="photo-grid">{photos.map(photo => <div className="photo-thumb" key={photo.id}><img src={URL.createObjectURL(photo.blob)} alt={`${prefecture.name}の思い出`} onClick={() => setPreview(photo)} /><button type="button" onClick={() => removePhoto(photo.id)} aria-label="この写真を削除">×</button></div>)}</div>}
      </div></div>

      {draft.travelLogs?.length > 0 && <div className="panel-section travel-log-archive"><h3 className="panel-section-title">旅ログ</h3><p className="panel-note">旅行中モードで残したチェックイン・立ち寄りを時刻順で見返せます。</p>
        <div className="travel-log-archive-list">{draft.travelLogs.map(log => <details key={log.id} className="travel-log-trip">
          <summary><strong>{log.title || "旅行"}</strong><span>{log.startDate || "日程未定"}{log.endDate ? ` 〜 ${log.endDate}` : ""}</span></summary>
          <div className="travel-log-trip-body">{log.days.map((logDay, dayIndex) => <section key={`${log.id}:${logDay.date}:${dayIndex}`} className="travel-log-day">
            <h4>{logDay.date ? new Date(`${logDay.date}T00:00:00`).toLocaleDateString("ja-JP", { month: "long", day: "numeric" }) : logDay.label || `${dayIndex + 1}日目`}</h4>
            <ol>{logDay.entries.map(entry => <li key={entry.id}>
              <time dateTime={entry.at}>{entry.at ? new Date(entry.at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</time>
              <div><strong>{entry.name}</strong><span>{entry.kind}</span>{entry.memo && <p>「{entry.memo}」</p>}{entry.photoCount > 0 && <small>📷 写真 {entry.photoCount}枚</small>}</div>
            </li>)}</ol>
            <div className="memory-log-share">
              <TravelLogShare
                title={log.title}
                dayLabel={logDay.label || `${dayIndex + 1}日目の旅ログ`}
                dayDate={logDay.date}
                entries={logDay.entries}
                planId={log.id}
              />
            </div>
          </section>)}</div>
        </details>)}</div>
      </div>}
  <details className="panel-section panel-collapsible"><summary className="panel-section-title">旅の詳細</summary>
  <label htmlFor="companions">一緒に行った人</label>
  <input id="companions" type="text" placeholder="家族、友達、一人旅など" value={draft.companions} onChange={event => setDraft(previous => ({ ...previous, companions: event.target.value }))} />
  <label htmlFor="municipalities">行った市町村</label><input id="municipalities" type="text" placeholder="名古屋市、犬山市、常滑市" value={draft.municipalities} onChange={event => setDraft(previous => ({ ...previous, municipalities: event.target.value }))} />
  <label htmlFor="foods">食べたもの</label><input id="foods" type="text" placeholder="味噌カツ、手羽先、ひつまぶし" value={draft.foods} onChange={event => setDraft(previous => ({ ...previous, foods: event.target.value }))} />
  <label htmlFor="recommended-spots">おすすめスポット</label><input id="recommended-spots" type="text" placeholder="名古屋城、犬山城、熱田神宮" value={draft.recommendedSpots} onChange={event => setDraft(previous => ({ ...previous, recommendedSpots: event.target.value }))} />
  </details>
  <details className="panel-section panel-collapsible"><summary className="panel-section-title">行きたい</summary>
  <button type="button" className={`want-toggle${draft.wantToVisit ? " active" : ""}`} aria-pressed={draft.wantToVisit} aria-label={`${prefecture.name}の行きたい状態を切り替え`} onClick={() => setDraft(previous => ({ ...previous, wantToVisit: !previous.wantToVisit }))}>♡ 行きたい</button>
  <label htmlFor="want-reason">行きたい理由</label><textarea id="want-reason" rows="3" placeholder="いつか見たい景色や、旅したい理由" value={draft.wantToVisitReason} onChange={event => setDraft(previous => ({ ...previous, wantToVisitReason: event.target.value }))} />
  <label htmlFor="want-places">行きたい場所メモ</label><textarea id="want-places" rows="3" placeholder="札幌、小樽、富良野" value={draft.wantToVisitPlaces} onChange={event => setDraft(previous => ({ ...previous, wantToVisitPlaces: event.target.value }))} />
  </details>
  <p className="panel-note">未訪問に戻して保存しても、日付と文章は残ります。</p>
  {(error || readError) && <p role="alert" className="storage-error">{error || readError}</p>}
  <button type="submit" className="save-memory" disabled={Boolean(readError)}>保存する</button>
</form>
{preview && <div className="photo-preview" role="dialog" aria-label="写真の拡大表示" onClick={() => setPreview(null)}><img src={URL.createObjectURL(preview.blob)} alt={`${prefecture.name}の思い出`} /><button type="button" onClick={() => setPreview(null)}>閉じる</button></div>}
</dialog>;
}

function MemoriesList({ visits, onSelect }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [covers, setCovers] = useState({});
  const entries = prefectures.filter(({ id }) => visits.records[id]);
  useEffect(() => {
    let active = true;
    Promise.all(entries.map(async ({ id }) => {
      try { const photos = await listPhotos(id); return [id, photos[0] ? URL.createObjectURL(photos[0].blob) : ""]; }
      catch { return [id, ""]; }
    })).then(items => { if (active) setCovers(Object.fromEntries(items)); });
    return () => { active = false; Object.values(covers).forEach(url => url && URL.revokeObjectURL(url)); };
  }, [visits.records]);
  const filtered = entries.filter(({ id, name }) => {
    const record = visits.records[id];
    const needle = query.trim().toLocaleLowerCase();
    const matchesQuery = !needle || `${name} ${record.memory}`.toLocaleLowerCase().includes(needle);
    const hasPhoto = Boolean(covers[id]);
    const matchesFilter = filter === "all" || (filter === "visited" && record.visited) || (filter === "unvisited" && !record.visited) || (filter === "photo" && hasPhoto) || (filter === "no-photo" && !hasPhoto) || (filter === "favorite" && record.favorite === true) || (filter === "want" && record.wantToVisit === true);
    return matchesQuery && matchesFilter;
  }).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ja");
    const aDate = visits.records[a.id].visitDate || "";
    const bDate = visits.records[b.id].visitDate || "";
    return sort === "oldest" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  });
  return <section className="memories-page" aria-labelledby="memories-title"><div className="memories-header"><div><p className="section-kicker">YOUR MEMORIES</p><h1 id="memories-title">思い出一覧</h1></div><p>{filtered.length} / {entries.length}件</p></div><div className="memory-controls"><label className="memory-search">検索<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="都道府県名や思い出を検索" /><button type="button" aria-label="検索をクリア" onClick={() => setQuery("")} disabled={!query}>×</button></label><label>絞り込み<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">すべて</option><option value="visited">訪問済み</option><option value="unvisited">未訪問</option><option value="photo">写真あり</option><option value="no-photo">写真なし</option><option value="favorite">お気に入り</option><option value="want">行きたい</option></select></label><label>並び替え<select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">訪問日の新しい順</option><option value="oldest">訪問日の古い順</option><option value="name">都道府県順</option></select></label></div>{!filtered.length ? <div className="memories-empty" aria-live="polite"><span>⌕</span><h2>{filter === "favorite" && !filtered.length ? "お気に入りの思い出はまだありません" : filter === "want" && !filtered.length ? "行きたい県はまだありません" : entries.length ? "条件に一致する思い出がありません" : "まだ思い出がありません。"}</h2><p>{entries.length ? "検索語や絞り込み条件を変えてみてください。" : "地図から旅の記録を追加してみましょう。"}</p>{!entries.length && <button type="button" onClick={() => onSelect(null)}>地図を見る</button>}</div> : <div className="memory-grid">{filtered.map(({ id, name }) => { const record = visits.records[id]; return <button type="button" className="memory-card" key={id} onClick={() => onSelect(id)}><div className="memory-card-photo">{covers[id] ? <img src={covers[id]} alt={`${name}の代表写真`} /> : <span aria-hidden="true">⌁</span>}</div><div className="memory-card-body"><div className="memory-card-top"><h2>{name}{record.favorite === true && <span className="favorite-mark" role="img" aria-label="お気に入り">★</span>}</h2><span className={record.visited ? "visited-badge" : "unvisited-badge"}>{record.visited ? "訪問済み" : "未訪問"}</span>{record.wantToVisit === true && <span className="want-badge">行きたい</span>}</div><p className="memory-card-date">{record.visitDate || "訪問日未記録"}</p>{record.rating > 0 && <p className="rating-display" aria-label={`お気に入り度${record.rating}つ星`}>{"★".repeat(record.rating)}{"☆".repeat(5 - record.rating)}</p>}<p className="memory-card-text">{record.memory || "思い出の文章はまだありません。"}</p>{record.companions && <p className="companions-text">一緒に行った人：{record.companions}</p>}{record.municipalities && <p className="companions-text">行った市町村：{record.municipalities}</p>}{record.foods && <p className="companions-text">食べたもの：{record.foods}</p>}{record.recommendedSpots && <p className="companions-text">おすすめスポット：{record.recommendedSpots}</p>}</div></button>; })}</div>}</section>;
}
function WantList({ visits, onSelect }) {
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState("name");
  const [covers, setCovers] = useState({});
  const entries = prefectures.filter(({ id }) => visits.records[id]?.wantToVisit === true);
  useEffect(() => {
    let active = true;
    Promise.all(entries.map(async ({ id }) => { try { const photos = await listPhotos(id); return [id, photos[0] ? URL.createObjectURL(photos[0].blob) : ""]; } catch { return [id, ""]; } }))
      .then(items => { if (active) setCovers(Object.fromEntries(items)); });
    return () => { active = false; };
  }, [visits.records]);
  const regionIds = region === "all" ? null : new Set((REGIONS.find(([name]) => name === region) || ["", []])[1]);
  const filtered = entries.filter(({ id }) => !regionIds || regionIds.has(id)).sort((a, b) => {
    const ra = visits.records[a.id], rb = visits.records[b.id];
    if (sort === "favorite") return Number(rb.favorite === true) - Number(ra.favorite === true) || a.name.localeCompare(b.name, "ja");
    return a.name.localeCompare(b.name, "ja");
  });
  return <section className="memories-page" aria-labelledby="want-title"><div className="memories-header"><div><p className="section-kicker">NEXT DESTINATIONS</p><h1 id="want-title">行きたい県</h1></div><p>{filtered.length} / {entries.length}件</p></div><div className="memory-controls want-controls"><label>地方<select value={region} onChange={event => setRegion(event.target.value)}><option value="all">すべて</option>{REGIONS.map(([name]) => <option key={name} value={name}>{name}</option>)}</select></label><label>並び替え<select value={sort} onChange={event => setSort(event.target.value)}><option value="name">都道府県順</option><option value="favorite">お気に入り優先</option></select></label></div>{!filtered.length ? <div className="memories-empty" aria-live="polite"><span>♡</span><h2>行きたい県はまだありません。</h2><p>地図から気になる県を「行きたい」に追加してみましょう。</p></div> : <div className="memory-grid">{filtered.map(({ id, name }) => { const record = visits.records[id]; return <button type="button" className="memory-card" key={id} onClick={() => onSelect(id)}><div className="memory-card-photo">{covers[id] ? <img src={covers[id]} alt={`${name}の代表写真`} /> : <span aria-hidden="true">♡</span>}</div><div className="memory-card-body"><div className="memory-card-top"><h2>{name}{record.favorite === true && <span className="favorite-mark" role="img" aria-label="お気に入り">★</span>}</h2><span className="want-badge">行きたい</span></div>{record.wantToVisitReason && <p className="want-note">行きたい理由：{record.wantToVisitReason}</p>}{record.wantToVisitPlaces && <p className="want-note">行きたい場所：{record.wantToVisitPlaces}</p>}{record.visited && <p className="memory-card-date"><span className="visited-badge">訪問済み</span></p>}<p className="memory-card-text">{record.memory || "思い出の文章はまだありません。"}</p>{record.companions && <p className="companions-text">一緒に行った人：{record.companions}</p>}{record.municipalities && <p className="companions-text">行った市町村：{record.municipalities}</p>}{record.foods && <p className="companions-text">食べたもの：{record.foods}</p>}{record.recommendedSpots && <p className="companions-text">おすすめスポット：{record.recommendedSpots}</p>}</div></button>; })}</div>}</section>;
}
function YearTable({ visits, onSelect }) {
  const [yearFilter, setYearFilter] = useState("all");
  const [covers, setCovers] = useState({});
  const entries = prefectures.filter(({ id }) => visits.records[id]?.visitDate).sort((a,b) => visits.records[b.id].visitDate.localeCompare(visits.records[a.id].visitDate));
  const years = [...new Set(entries.map(({ id }) => visits.records[id].visitDate.slice(0,4)))];
  const shown = yearFilter === "all" ? entries : entries.filter(({ id }) => visits.records[id].visitDate.startsWith(yearFilter));
  const groups = shown.reduce((out, entry) => { const y=visits.records[entry.id].visitDate.slice(0,4); (out[y] ||= []).push(entry); return out; }, {});
  const mostYear = years.map(y => [y, entries.filter(({id}) => visits.records[id].visitDate.startsWith(y)).length]).sort((a,b)=>b[1]-a[1])[0];
  useEffect(() => { let active=true; Promise.all(entries.map(async ({id}) => { try { const p=await listPhotos(id); return [id,p[0]?URL.createObjectURL(p[0].blob):""]; } catch { return [id,""]; } })).then(items=>{if(active)setCovers(Object.fromEntries(items));}); return ()=>{active=false;}; }, [visits.records]);
  return <section className="memories-page year-table-page" aria-labelledby="year-table-title"><div className="memories-header"><div><p className="section-kicker">YOUR TRAVEL YEARS</p><h1 id="year-table-title">旅行年表</h1></div><label>表示年<select value={yearFilter} onChange={e=>setYearFilter(e.target.value)}><option value="all">すべての年</option>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select></label></div><div className="year-summary"><span>記録のある年数 <strong>{years.length}</strong></span><span>合計訪問県数 <strong>{entries.length}</strong></span>{mostYear && <span>最多記録 <strong>{mostYear[0]}年（{mostYear[1]}件）</strong></span>}</div>{!shown.length ? <div className="memories-empty"><span>⌁</span><h2>まだ旅行記録がありません。</h2><p>訪問日を登録すると、ここに年表が表示されます。</p></div> : <div className="year-groups">{Object.entries(groups).map(([year, items])=><section className="year-group" key={year}><h2>{year}年 <small>{items.length}県訪問</small></h2>{items.map(({id,name})=>{const r=visits.records[id]; return <button type="button" className="year-item" key={id} onClick={()=>onSelect(id)}><time dateTime={r.visitDate}>{new Date(`${r.visitDate}T00:00:00`).toLocaleDateString("ja-JP",{month:"long",day:"numeric"})}</time><div className="year-item-content"><h3>{name}</h3>{r.rating>0&&<p className="rating-display">{"★".repeat(r.rating)}{"☆".repeat(5-r.rating)}</p>}{r.companions&&<p className="companions-text">一緒に行った人：{r.companions}</p>}{r.municipalities&&<p className="companions-text">行った市町村：{r.municipalities}</p>}{r.foods&&<p className="companions-text">食べたもの：{r.foods}</p>}{r.recommendedSpots&&<p className="companions-text">おすすめスポット：{r.recommendedSpots}</p>}<p className="memory-card-text">{r.memory||"思い出の文章はまだありません。"}</p></div>{covers[id]&&<img src={covers[id]} alt={`${name}の代表写真`} />}</button>;})}</section>)}</div>}</section>;
}
function Ranking({ visits, onSelect }) {
  const [covers, setCovers] = useState({});
  const entries = prefectures.filter(({ id }) => visits.records[id]?.visited).sort((a, b) => {
    const ra = visits.records[a.id], rb = visits.records[b.id];
    return (rb.rating || 0) - (ra.rating || 0) || (rb.visitDate || "").localeCompare(ra.visitDate || "") || a.name.localeCompare(b.name, "ja");
  });
  useEffect(() => { let active = true; Promise.all(entries.map(async ({ id }) => { try { const photos = await listPhotos(id); return [id, photos[0] ? URL.createObjectURL(photos[0].blob) : ""]; } catch { return [id, ""]; } })).then(items => { if (active) setCovers(Object.fromEntries(items)); }); return () => { active = false; }; }, [visits.records]);
  return <section className="memories-page ranking-page" aria-labelledby="ranking-title"><div className="memories-header"><div><p className="section-kicker">YOUR FAVORITES</p><h1 id="ranking-title">訪問県ランキング</h1></div><p>{entries.length}県</p></div>{!entries.length ? <div className="memories-empty"><span>♧</span><h2>まだランキングに表示できる県がありません。</h2><p>旅の思い出を登録してみましょう。</p></div> : <div className="memory-grid">{entries.map(({ id, name }, index) => { const record = visits.records[id]; const rank = index + 1; return <button type="button" className={`memory-card ranking-card rank-${rank <= 3 ? rank : "other"}`} key={id} onClick={() => onSelect(id)}><div className="memory-card-photo">{covers[id] ? <img src={covers[id]} alt={`${name}の代表写真`} /> : <span aria-hidden="true">⌁</span>}</div><div className="memory-card-body"><div className="ranking-rank"><strong>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}位`}</strong><span>{record.favorite === true ? "★" : ""}</span></div><div className="memory-card-top"><h2>{name}</h2><span className="visited-badge">訪問済み</span></div><p className="rating-display" aria-label={`お気に入り度${record.rating || 0}つ星`}>{"★".repeat(record.rating || 0)}{"☆".repeat(5 - (record.rating || 0))}</p><p className="memory-card-date">{record.visitDate || "訪問日未記録"}</p><p className="memory-card-text">{record.memory || "思い出の文章はまだありません。"}</p>{record.foods && <p className="companions-text">食べたもの：{record.foods}</p>}{record.recommendedSpots && <p className="companions-text">おすすめスポット：{record.recommendedSpots}</p>}</div></button>; })}</div>}</section>;
}
function Timeline({ visits, onSelect }) {
  const [order, setOrder] = useState("newest");
  const [covers, setCovers] = useState({});
  const entries = prefectures.filter(({ id }) => visits.records[id]?.visitDate).sort((a, b) => { const diff = visits.records[b.id].visitDate.localeCompare(visits.records[a.id].visitDate); return order === "newest" ? diff : -diff; });
  useEffect(() => { let active = true; Promise.all(entries.map(async ({ id }) => { try { const photos = await listPhotos(id); return [id, photos[0] ? URL.createObjectURL(photos[0].blob) : ""]; } catch { return [id, ""]; } })).then(items => { if (active) setCovers(Object.fromEntries(items)); }); return () => { active = false; }; }, [visits.records, order]);
  const groups = entries.reduce((result, entry) => { const year = visits.records[entry.id].visitDate.slice(0, 4); (result[year] ||= []).push(entry); return result; }, {});
  return <section className="timeline-page" aria-labelledby="timeline-title"><div className="memories-header"><div><p className="section-kicker">YOUR TRAVEL STORY</p><h1 id="timeline-title">タイムライン</h1></div><label className="timeline-sort">並び順<select value={order} onChange={event => setOrder(event.target.value)}><option value="newest">新しい順</option><option value="oldest">古い順</option></select></label></div>{!entries.length ? <div className="memories-empty"><span>✦</span><h2>まだ日付のある思い出がありません。</h2><p>詳細パネルで訪問日を追加すると、ここに旅の記録が並びます。</p></div> : <div className="timeline-list">{Object.entries(groups).map(([year, yearEntries]) => <section className="timeline-year" key={year}><h2>{year}年</h2>{yearEntries.map(({ id, name }) => { const record = visits.records[id]; return <button type="button" className="timeline-item" key={id} onClick={() => onSelect(id)}><time dateTime={record.visitDate}>{new Date(`${record.visitDate}T00:00:00`).toLocaleDateString("ja-JP", { month: "long", day: "numeric" })}</time><span className="timeline-dot" aria-hidden="true" /><div className="timeline-content"><div className="memory-card-top"><h3>{name}{record.favorite === true && <span className="favorite-mark" role="img" aria-label="お気に入り">★</span>}</h3><span className={record.visited ? "visited-badge" : "unvisited-badge"}>{record.visited ? "訪問済み" : "未訪問"}</span></div><p className="memory-card-text">{record.memory || "思い出の文章はまだありません。"}</p>{record.companions && <p className="companions-text">一緒に行った人：{record.companions}</p>}{record.municipalities && <p className="companions-text">行った市町村：{record.municipalities}</p>}{record.foods && <p className="companions-text">食べたもの：{record.foods}</p>}{record.recommendedSpots && <p className="companions-text">おすすめスポット：{record.recommendedSpots}</p>}{record.rating > 0 && <p className="rating-display" aria-label={`お気に入り度${record.rating}つ星`}>{"★".repeat(record.rating)}{"☆".repeat(5 - record.rating)}</p>}</div>{covers[id] && <img src={covers[id]} alt={`${name}の代表写真`} />}</button>; })}</section>)}</div>}</section>;

}

function JapanMap({ onSelect, visited, wantToVisitIds }) {
  const [activeId, setActiveId] = useState(null);
  const active = prefectures.find(({ id }) => id === activeId);
  return (
    <div className="map-shell">
    <svg
      className="japan-map"
      viewBox="0 0 800 760"
      role="group"
      aria-labelledby="map-title map-description"
    >
      <title id="map-title">47都道府県の訪問マップ</title>
      <desc id="map-description">
        現在の訪問数は{visited.length}
        県です。都道府県を選ぶと思い出の詳細パネルを開きます。Tabで移動し、Enterまたはスペースで選択できます。沖縄県は左上の別枠に表示しています。
      </desc>
      <path className="inset-line" d="M50 290h210l35-35V100" />
      <text className="map-label" x="66" y="105">
        沖縄
      </text>
      {prefectures.map(({ id, name, d }) => (
        <path
          key={id}
          id={`prefecture-${id}`}
          data-prefecture-id={id}
          className={`prefecture interactive${visited.includes(id) ? " visited" : wantToVisitIds.includes(id) ? " want-to-visit" : ""}`}
          d={d}
          role="button"
          tabIndex={0}
          aria-label={`${name}・${visited.includes(id) ? "訪問済み" : "未訪問"}の思い出を開く`}
          aria-haspopup="dialog"
          onClick={(event) =>
            onSelect(Number(event.currentTarget.dataset.prefectureId))
          }
          onMouseEnter={() => setActiveId(id)}
          onMouseLeave={() => setActiveId(null)}
          onFocus={() => setActiveId(id)}
          onBlur={() => setActiveId(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!event.repeat) {
                onSelect(Number(event.currentTarget.dataset.prefectureId));
              }
            }
          }}
        >
          <title>
            {name}・{visited.includes(id) ? "訪問済み" : "未訪問"}
          </title>
        </path>
      ))}
    </svg>
    {active && <div className="map-tooltip" role="status"><strong>{active.name}</strong><span>{visited.includes(active.id) ? "訪問済み" : wantToVisitIds.includes(active.id) ? "行きたい" : "未訪問"}</span></div>}
    </div>
  );
}

function App({ initialPlanId }) {
  const [requestedPlanId, setRequestedPlanId] = useState(initialPlanId);
  const [visits, setVisits] = useState(readVisits);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState(initialPlanId ? "plans" : "map");
  const visited = prefectures.filter(({ id }) => visits.records[id]?.visited).map(({ id }) => id);
  const count = visited.length;
  const wantToVisitIds = prefectures.filter(({ id }) => visits.records[id]?.wantToVisit && !visits.records[id]?.visited).map(({ id }) => id);
  const { percent, title: travelTitle } = getTravelAchievement(count);
  const completedRegions = REGIONS.filter(([, ids]) => ids.every(id => visited.includes(id)));

  function saveMemory(id, draft, source = visits) {
    if (visits.error) return visits.error;
    if (!validIds.has(id)) return "都道府県を選び直してください。";
    const records = { ...source.records, [id]: { ...draft, importedTripPlanIds: importedIds([...(source.records[id]?.importedTripPlanIds || []), ...(draft.importedTripPlanIds || [])]) } };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      return "保存できませんでした。入力内容はこのパネルに残っています。空き容量やブラウザー設定を確認して、もう一度保存してください。";
    }
    setVisits({ records, error: "", announcement: `${prefectures.find(prefecture => prefecture.id === id).name}の思い出を保存しました。` });
    return "";
  }

  function importTrip(plan, values) {
    const source = readVisits();
    if (source.error) return { error: source.error };
    const previous = Object.entries(source.records).find(([, record]) => importedIds(record.importedTripPlanIds).includes(plan.id));
    if (previous) { setVisits(source); return { already: true, prefectureId: Number(previous[0]) }; }
    if (!validIds.has(plan.prefectureId)) return { error: "行き先を選んでください。" };
    const record = mergeTripMemory({ ...emptyMemory, ...source.records[plan.prefectureId] }, plan, values);
    const error = saveMemory(plan.prefectureId, record, source);
    return { error, prefectureId: plan.prefectureId };
  }

  return (
    <>
      <a className="skip-link" href="#main">
        メインコンテンツへ
      </a>
      <header className="site-header">
        <a className="brand" href="./" aria-label="旅図帳 ホーム">
          <span className="brand-icon">
  <Icon name="map" />
  </span>
  旅図帳<span className="brand-dot">.</span>
</a>
<span className="header-note">わたしだけの、旅の地図。</span>
</header>
<main id="main">
<nav className="view-tabs" aria-label="表示切り替え" onClickCapture={event => { if (view === "plans" && event.target.closest("button") && !window.dispatchEvent(new Event("trip-plan-leave", { cancelable: true }))) { event.preventDefault(); event.stopPropagation(); } }}><button type="button" className={view === "map" ? "active" : ""} aria-current={view === "map" ? "page" : undefined} onClick={() => setView("map")}>地図</button><button type="button" className={view === "memories" ? "active" : ""} aria-current={view === "memories" ? "page" : undefined} onClick={() => setView("memories")}>思い出一覧</button><button type="button" className={view === "want" ? "active" : ""} aria-current={view === "want" ? "page" : undefined} onClick={() => setView("want")}>行きたい</button><button type="button" className={view === "ranking" ? "active" : ""} aria-current={view === "ranking" ? "page" : undefined} onClick={() => setView("ranking")}>ランキング</button><button type="button" className={view === "year" ? "active" : ""} aria-current={view === "year" ? "page" : undefined} onClick={() => setView("year")}>旅行年表</button><button type="button" className={view === "timeline" ? "active" : ""} aria-current={view === "timeline" ? "page" : undefined} onClick={() => setView("timeline")}>タイムライン</button><button type="button" className={view === "plans" ? "active" : ""} aria-current={view === "plans" ? "page" : undefined} onClick={() => setView("plans")}>旅の計画</button></nav>
{view === "plans" ? <TripPlans onImport={importTrip} onOpenMemory={setSelectedId} initialPlanId={requestedPlanId} onInitialPlanOpened={() => setRequestedPlanId(null)} /> : view === "year" ? <YearTable visits={visits} onSelect={setSelectedId} /> : view === "ranking" ? <Ranking visits={visits} onSelect={setSelectedId} /> : view === "timeline" ? <Timeline visits={visits} onSelect={setSelectedId} /> : view === "want" ? <WantList visits={visits} onSelect={setSelectedId} /> : view === "memories" ? <MemoriesList visits={visits} onSelect={(id) => { if (id === null) setView("map"); else setSelectedId(id); }} /> : <>
<section className="intro" aria-labelledby="home-title">
  <p className="eyebrow">
    <span /> YOUR TRAVEL, YOUR COLORS
  </p>
  <h1 id="home-title">
    旅した場所を、
    <wbr />
    <span>思い出で塗っていこう。</span>
  </h1>
  <p className="intro-copy">
    見つけた景色も、忘れたくない一日も。
    <br />
    日本地図に残す、あなただけの旅の記録。
  </p>
</section>
<section className="progress-card" aria-label="旅の進捗">
  <div className="progress-heading">
    <span className="section-kicker">
      <Icon name="pin" />
      これまでの足あと
    </span>
    <span className="progress-total">
      47都道府県中{" "}
      <strong>
        {count}
        <span>県訪問</span>
      </strong>
    </span>
  </div>
  <p className={`national-goal${count === prefectures.length ? " complete" : ""}`}>{count === prefectures.length ? "日本全国制覇！" : `全国制覇まであと${prefectures.length - count}県`}</p>
  <div className="progress-bottom">
    <progress
      value={count}
      max={prefectures.length}
      aria-label={`全国の達成率 ${percent}%（47都道府県中${count}県訪問）`}
    />
    <span className="achievement-percent">達成率 {percent}%</span>
  </div>
  <p className="travel-title"><span>現在の称号</span><strong>{travelTitle}</strong></p>
  {completedRegions.length > 0 && <ul className="region-badges" aria-label="制覇した地方">
    {completedRegions.map(([name]) => <li key={name}>{name}{name === "北海道" ? "" : "地方"} 制覇</li>)}
  </ul>}
  <div className="region-progress" aria-label="地方別の進捗">
    {REGIONS.map(([name, ids]) => { const done = ids.filter(id => visited.includes(id)).length; const complete = done === ids.length; return <div className={`region-item${complete ? " complete" : ""}`} key={name}><div className="region-label"><span>{name}</span><strong>{complete ? "達成" : `${done} / ${ids.length}`}</strong></div><progress value={done} max={ids.length} aria-label={`${name}${done} / ${ids.length}`} /></div>; })}
  </div>

</section>
<p className="sr-only" role="status">
  {visits.announcement ?? ""}
</p>
{(visits.error) && (
  <p className="storage-error" role="alert">
    {visits.error}
  </p>
)}
<section className="map-card" aria-labelledby="map-heading">
  <div className="map-heading">
    <div>
      <p className="section-kicker">MY TRAVEL MAP</p>
      <h2 id="map-heading" tabIndex={-1}>あなたの旅の地図</h2>
    </div>
    <span className="legend">
      <i />
      未訪問
      <i className="visited-swatch" />
      訪問済み
    </span>
  </div>
  <p className="map-help">
    県をタップ・クリックして、訪問状態や思い出を記録できます。
    <br />
    <a href="#prefecture-picker" onClick={() => setPickerOpen(true)}>
      小さな県は一覧から選択
    </a>{" "}
    · Tabで移動、Enter／スペースで詳細を開く
  </p>
  <div className="map-canvas">
    <JapanMap onSelect={setSelectedId} visited={visited} wantToVisitIds={wantToVisitIds} />
    <div className="map-message">
      <span className="small-icon">
        <Icon name="map" />
      </span>
      <p>
        まだ見ぬ景色が、
        <br />
        あなたを待っています。
      </p>
      <span>次の旅は、どこにしよう。</span>
    </div>
    <span className="map-caption">ひとつの旅から、地図が色づく。</span>
  </div>
  <div className="map-footer">
    <span>
      <span className="green-dot" />
      ここから、あなたの旅がはじまります
    </span>
    <span>{count} / 47 PREFECTURES</span>
  </div>
</section>
<ShareTravel count={count} total={prefectures.length} visited={visited} records={visits.records} />
<section className="memory-note" aria-labelledby="memory-title">
  <span className="memory-icons">
    <Icon name="camera" />
    <Icon name="pen" />
  </span>
  <div>
    <h2 id="memory-title">思い出が増えるたび、地図もカラフルに。</h2>
    <p>
      写真やことば、旅した日付を、訪れた場所と一緒に。
      <br className="mobile-break" />
      地図から県を選んで、旅の思い出を残しましょう。
    </p>
  </div>
</section>
<details
  className="prefecture-list"
  id="prefecture-picker"
  open={pickerOpen}
  onToggle={(event) => setPickerOpen(event.currentTarget.open)}
>
  <summary>都道府県の一覧から選ぶ（{count}県訪問済み）</summary>
  <ul>
    {prefectures.map(({ id, name }) => (
      <li key={id}>
        <button
          type="button"
          data-visited={visited.includes(id)}
          aria-haspopup="dialog"
          onClick={() => setSelectedId(id)}
        >
          <span>{name}</span>
          <span>{visited.includes(id) ? "✓ 訪問済み" : "未訪問"}</span>
        </button>
      </li>
    ))}
  </ul>
</details>
<section className="home-guide" aria-labelledby="about-tabinuri-title">
  <h2 id="about-tabinuri-title">旅図帳とは</h2>
  <p>旅図帳（たびずちょう）は、旅行前の計画から旅行後の思い出までを、ひとつにつなげて残せる無料の旅行サービスです。「行きたい」をメモし、行き先や日程を決めて旅の計画を作れます。</p>
  <p>AIに旅行スケジュールを提案してもらい、旅のしおりをLINEなどで友達に共有。旅行後は計画を旅図帳へ保存すると、訪れた都道府県が日本地図に色付きます。写真や食べたもの、訪問日、思い出も書き足せます。</p>
  <p>会員登録・インストールは不要。スマートフォン・PCのブラウザから、これからの旅にも過去の旅行記録にも使えます。</p>
</section>
<section className="home-guide" aria-labelledby="home-features-title">
  <h2 id="home-features-title">旅図帳でできること</h2>
  <div className="home-feature-grid">
    <div className="home-feature"><h3>AIで旅の計画を作る</h3><p>行き先・日程・予算・やりたいことなどをもとに、AIが旅行日数に合わせた旅程を提案します。</p></div>
    <div className="home-feature"><h3>旅のしおりを作る</h3><p>日ごとの予定、時間、場所、メモをまとめて、旅行中にも見やすいしおりとして使えます。</p></div>
    <div className="home-feature"><h3>LINEやURLで共有</h3><p>しおりをLINEや共有リンクで友達に送れます。受け取った人は登録なしで閲覧できます。</p></div>
    <div className="home-feature"><h3>しおりを自分の計画にコピー</h3><p>友達から届いたしおりを自分の旅の計画へコピーし、日程や予定を自由に編集できます。</p></div>
    <div className="home-feature"><h3>日本地図に旅を残す</h3><p>旅行後に計画を旅図帳へ保存すると、行き先の都道府県を訪問済みにして地図に残せます。</p></div>
    <div className="home-feature"><h3>写真と思い出を記録</h3><p>訪問日・写真・一緒に行った人・食べたもの・おすすめスポットなどを都道府県ごとに保存できます。</p></div>
    <div className="home-feature"><h3>行きたい場所を管理</h3><p>気になる県や行きたい場所、行きたい理由をメモし、次の旅行候補として残せます。</p></div>
    <div className="home-feature"><h3>旅を振り返る</h3><p>旅行年表・タイムライン・ランキング・日本地図で振り返れます。旅マップを画像や文章で共有することもできます。</p></div>
  </div>
</section>
<section className="home-guide" aria-labelledby="home-steps-title">
  <h2 id="home-steps-title">使い方は3ステップ</h2>
  <ol className="home-steps">
    <li><span className="section-kicker">STEP 1</span><h3>旅の計画を作る</h3><p>「旅の計画」から行き先や日程を入力します。自分で予定を追加するほか、「AIで旅程を作る」で提案を受け取り、確認して保存できます。</p></li>
    <li><span className="section-kicker">STEP 2</span><h3>しおりを共有して旅を楽しむ</h3><p>旅のしおりはLINEやURLで共有できます。友達から届いたしおりを自分の計画にコピーして編集することもできます。</p></li>
    <li><span className="section-kicker">STEP 3</span><h3>旅行後は思い出を日本地図へ</h3><p>旅行が終わったら「この旅行を旅図帳に保存」。訪問した県を地図に残し、写真や食べたもの、思い出を追加して振り返れます。</p></li>
  </ol>
  <p className="trip-storage-note">過去の旅行を記録するだけでも利用できます。日本地図から都道府県を選んで、直接思い出を追加できます。</p>
  <div className="home-guide-actions">
    <button type="button" className="home-map-cta" onClick={() => setView("plans")}>旅の計画を作る</button>
    <a href="#map-heading" onClick={(event) => {
      const heading = document.getElementById("map-heading");
      if (!heading) return;
      event.preventDefault();
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }}>過去の旅を日本地図に記録する</a>
    <a href="/how-to-use.html">詳しい使い方を見る</a>
  </div>
</section>
<section className="home-guide home-faq" aria-labelledby="faq-title">
  <h2 id="faq-title">よくある質問</h2>
  <details>
    <summary>旅図帳は無料で使えますか？</summary>
  <p>はい。現在の旅図帳は無料で利用でき、会員登録も必要ありません。通信に必要な料金は利用者の負担となります。</p>
  </details>
  <details>
    <summary>会員登録やログインは必要ですか？</summary>
  <p>必要ありません。旅行計画や旅行記録は基本的に利用しているブラウザ内へ保存されます。別の端末やブラウザへ自動同期はされません。</p>
  </details>
  <details>
    <summary>AIでは何ができますか？</summary>
  <p>行き先・日程・予算・行きたい場所などをもとに、1〜14日間の旅行スケジュールを提案します。雰囲気やペースを選び、作成結果を確認して「この旅程を使う」を押した後、編集して「計画を保存」できます。AI旅程の作成にはインターネット接続が必要です。</p>
  </details>
  <details>
    <summary>AIが作った旅行プランは必ず正しいですか？</summary>
  <p>AIの提案には、営業時間・料金・休業日などの最新情報と異なる内容が含まれる場合があります。旅行前に施設や交通機関の公式情報をご確認ください。</p>
  </details>
  <details>
    <summary>友達に旅のしおりを送れますか？</summary>
  <p>はい。「しおりを共有」から、LINE、対応端末の共有メニュー、リンクコピーを利用できます。受け取った人は会員登録なしで閲覧できます。リンクは作成時点の内容なので、予定を変更したら作り直して送ってください。</p>
  </details>
  <details>
    <summary>共有されたしおりを編集できますか？</summary>
  <p>共有しおり自体は閲覧専用です。「このしおりを自分の旅の計画にコピー」で自分用の計画を作り、日程や予定を自由に編集できます。コピーを編集しても元のしおりには影響しません。</p>
  </details>
  <details>
    <summary>共有リンクには何が含まれますか？</summary>
  <p>旅行タイトル・行き先・日程・スケジュール（予定名とメモを含む）は必ず含まれます。行きたい場所・食べたいもの・やりたいことは初期状態で選択されています。同行者・予算・宿泊先メモ・移動メモ・その他メモは初期状態では共有しません。</p>
  <p>リンクを知っている人は内容を閲覧・再共有できます。予定内のメモも確認し、個人情報や公開したくない情報は含めないでください。送信済みリンクの内容変更・取り消しはできません。</p>
  </details>
  <details>
    <summary>旅行後に何ができますか？</summary>
  <p>帰宅日以降に「この旅行を旅図帳に保存」から内容を確認し、行き先の県を訪問済みにして、訪問日・同行者・食べたもの・スポット・思い出を追記できます。写真は県の思い出画面から別途追加します。</p>
  </details>
  <details>
    <summary>写真はどこに保存されますか？</summary>
  <p>写真はブラウザ内でサイズを調整・圧縮し、お使いのブラウザのIndexedDBに保存します。1つの都道府県につき5枚まで保存できます。ブラウザのサイトデータを削除すると写真も失われるため、元の写真はご自身で保管してください。</p>
  </details>
  <details>
    <summary>スマートフォンでも使えますか？</summary>
  <p>はい。旅の計画・AI旅程・しおり共有・日本地図・思い出記録をスマートフォンのブラウザから利用できます。地図の小さな県は、下の都道府県一覧からも選べます。</p>
  </details>
  <details>
    <summary>データはどこに保存されますか？</summary>
  <p>旅行計画や旅行記録は主にブラウザのlocalStorage、写真はIndexedDBに保存します。サイトデータの削除などで失われることがあり、端末間の自動同期はありません。</p>
  <p>AI旅程を作成する場合は、入力中の必要な計画情報を旅図帳のサーバー経由でGoogle Geminiへ送信します。共有しおりは選択したデータをURLに含める仕組みです。Google Analytics 4によるアクセス解析も含め、詳しくは<a href="/privacy.html">プライバシーポリシー</a>をご確認ください。</p>
  </details>
</section>
</>}
</main>
{selectedId !== null && <MemoryPanel key={selectedId} prefecture={prefectures.find(({ id }) => id === selectedId)} record={visits.records[selectedId]} readError={visits.error} onSave={(id, draft) => { const result = saveMemory(id, draft); if (!result) setView("memories"); return result; }} onClose={() => setSelectedId(null)} />}
<footer className="site-footer">
<span className="footer-brand">
  旅図帳<span>.</span>
</span>
<span>旅の思い出を、日本地図に。</span>
<a href="/how-to-use.html">旅図帳の使い方</a>
<a href="/privacy.html">プライバシーポリシー</a>
<a href="/contact.html">お問い合わせ</a>
<a href="/about.html">運営者情報</a>
<small>
  地図：
  <a href="https://www.gsi.go.jp/kankyochiri/gm_jpn.html">
    国土地理院「地球地図日本」
  </a>{" "}
  / <a href="https://github.com/dataofjapan/land">Data of Japan</a>
  （形状を簡略化・一部離島省略・沖縄を別枠表示）
</small>
</footer>
</>);
}
const initialCopiedPlanId = typeof history.state?.openCopiedPlan === "string" ? history.state.openCopiedPlan : null;
if (initialCopiedPlanId) history.replaceState(null, "", location.href);
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).has("shared-trip") ? <SharedTrip /> : <App initialPlanId={initialCopiedPlanId} />}
  </React.StrictMode>,
);
