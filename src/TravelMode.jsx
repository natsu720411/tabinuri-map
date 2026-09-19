import React, { useEffect, useMemo, useRef, useState } from "react";
import { newId, todayLocal } from "./tripPlans.js";
import { MAX_PREFECTURE_PHOTOS, compressTravelPhoto, countPrefecturePhotos, saveTravelPhoto } from "./travelPhotos.js";
import TravelLogShare from "./TravelLogShare.jsx";
import TravelSummary from "./TravelSummary.jsx";
import { googleMapsNavigationForItem, googleMapsRouteForItem } from "./tripRoute.js";
import "./travelMode.css";

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function geoErrorMessage(error) {
  if (!error) return "位置情報を取得できませんでした。";
  if (error.code === 1) return "位置情報の利用が許可されませんでした。端末やブラウザの設定をご確認ください。";
  if (error.code === 2) return "現在地を取得できませんでした。屋外など電波を受信しやすい場所でお試しください。";
  if (error.code === 3) return "位置情報の取得がタイムアウトしました。もう一度お試しください。";
  return "位置情報を取得できませんでした。";
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function normalizePlaceName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[（）()【】\[\]「」『』・･.,，。/\\\s\-_]/g, "")
    .replace(/(?:を|で|に|へ)?(?:散策|観光|見学|訪問|参拝|食事|ランチ|昼食|ディナー|夕食|休憩|買い物|ショッピング|宿泊|チェックイン|到着|行く|いく)$/g, "");
}

function likelySamePlace(plannedName, nearbyName) {
  const planned = normalizePlaceName(plannedName);
  const nearby = normalizePlaceName(nearbyName);
  if (planned.length < 2 || nearby.length < 2) return false;
  if (planned.includes(nearby) || nearby.includes(planned)) return true;

  const trimBranch = value => value.replace(/(?:本店|支店|駅前店|店)$/g, "");
  const a = trimBranch(planned);
  const b = trimBranch(nearby);
  return a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a));
}

export default function TravelMode({ plan, onClose, onPersist, onFinish, onOpenMemory }) {
  const today = todayLocal();
  const initialDayIndex = Math.max(0, plan.days.findIndex(day => day.date === today));
  const [dayIndex, setDayIndex] = useState(initialDayIndex);
  const [position, setPosition] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [extraMemo, setExtraMemo] = useState("");
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyState, setNearbyState] = useState("idle");
  const [nearbyMessage, setNearbyMessage] = useState("");
  const [memoryItemId, setMemoryItemId] = useState("");
  const [memoryMemo, setMemoryMemo] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState("");
  const [memoryStopId, setMemoryStopId] = useState("");
  const [memoryStopMemo, setMemoryStopMemo] = useState("");
  const [memoryStopBusy, setMemoryStopBusy] = useState(false);
  const [memoryStopMessage, setMemoryStopMessage] = useState("");
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishMessage, setFinishMessage] = useState("");
  const [finishedPlan, setFinishedPlan] = useState(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const watchId = useRef(null);
  const lastNearbySearch = useRef({ at: 0, position: null });
  const nearbyAbort = useRef(null);

  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    nearbyAbort.current?.abort();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const day = plan.days[dayIndex] || { id: "", date: "", items: [], extraStops: [] };
  const completedCount = day.items.filter(item => item.completedAt || item.checkedInAt).length;
  const nextItem = day.items.find(item => !item.completedAt && !item.checkedInAt);
  const nextIndex = nextItem ? day.items.indexOf(nextItem) : -1;
  const dayLabel = day.date === today ? "今日" : day.date || `${dayIndex + 1}日目`;
  const progress = day.items.length ? Math.round((completedCount / day.items.length) * 100) : 0;
  const nextTiming = useMemo(() => {
    if (!nextItem || day.date !== today || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(nextItem.time || "")) return null;
    const [hours, minutes] = nextItem.time.split(":").map(Number);
    const current = new Date(clockNow);
    const target = new Date(current.getFullYear(), current.getMonth(), current.getDate(), hours, minutes, 0, 0).getTime();
    const diff = Math.round((target - clockNow) / 60000);
    if (diff > 1) return { kind: "ahead", text: `予定まであと${diff}分` };
    if (diff >= -1) return { kind: "now", text: "まもなく予定時刻です" };
    return { kind: "late", text: `予定時刻を${Math.abs(diff)}分過ぎています` };
  }, [nextItem, day.date, today, clockNow]);

  const plannedArrival = useMemo(() => {
    const matches = [];
    day.items.forEach((item, itemIndex) => {
      if (item.completedAt || item.checkedInAt || !item.name?.trim()) return;
      nearbyPlaces.forEach(place => {
        if (place.distance === null || place.distance > 350) return;
        if (!likelySamePlace(item.name, place.name)) return;
        matches.push({ item, itemIndex, place });
      });
    });
    matches.sort((a, b) => (a.place.distance ?? Infinity) - (b.place.distance ?? Infinity) || a.itemIndex - b.itemIndex);
    return matches[0] || null;
  }, [day.items, nearbyPlaces]);

  const travelLog = useMemo(() => {
    const scheduled = day.items
      .filter(item => item.checkedInAt || item.completedAt)
      .map(item => ({
        id: `item:${item.id}`,
        name: item.name,
        at: item.checkedInAt || item.completedAt,
        kind: item.checkedInAt ? "チェックイン" : "完了",
        memo: item.travelMemo || "",
        photoCount: Math.max(0, Number(item.travelPhotoCount) || 0),
      }));
    const extras = (day.extraStops || [])
      .filter(stop => stop.visitedAt)
      .map(stop => ({
        id: `stop:${stop.id}`,
        name: stop.name,
        at: stop.visitedAt,
        kind: "立ち寄り",
        memo: stop.travelMemo || "",
        photoCount: Math.max(0, Number(stop.travelPhotoCount) || 0),
      }));
    return [...scheduled, ...extras].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [day.items, day.extraStops]);

  const travelLogTitle = day.date === today ? "今日の旅ログ" : `${dayLabel}の旅ログ`;

  const persistDay = (transform) => {
    const days = plan.days.map((value, index) => index === dayIndex ? transform(value) : value);
    onPersist({ ...plan, days, updatedAt: new Date().toISOString() });
  };

  async function searchNearby(currentPosition, { force = false } = {}) {
    if (!currentPosition) return;
    const last = lastNearbySearch.current;
    const moved = distanceMeters(last.position, currentPosition);
    if (!force && Date.now() - last.at < 120000 && moved < 80) return;
    lastNearbySearch.current = { at: Date.now(), position: currentPosition };
    nearbyAbort.current?.abort();
    const controller = new AbortController();
    nearbyAbort.current = controller;
    setNearbyState("loading");
    setNearbyMessage("近くのお店・スポットを探しています…");
    try {
      const response = await fetch(`/api/nearby-places?lat=${encodeURIComponent(currentPosition.lat)}&lng=${encodeURIComponent(currentPosition.lng)}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "周辺スポットを取得できませんでした。");
      const places = Array.isArray(data.places) ? data.places : [];
      setNearbyPlaces(places);
      setNearbyState("ready");
      setNearbyMessage(places.length ? "現在地の近くにある候補です。実際に立ち寄った場所だけ記録してください。" : "近くに候補が見つかりませんでした。");
    } catch (error) {
      if (error.name === "AbortError") return;
      setNearbyState("error");
      setNearbyMessage(error.message || "周辺スポットを取得できませんでした。");
    }
  }

  function startLocation() {
    if (!navigator.geolocation) {
      setLocationState("error");
      setLocationMessage("この端末・ブラウザは位置情報に対応していません。");
      return;
    }
    if (watchId.current !== null) return;
    setLocationState("loading");
    setLocationMessage("現在地を取得しています…");
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => {
        const nextPosition = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, timestamp };
        setPosition(nextPosition);
        setLocationState("ready");
        setLocationMessage(coords.accuracy >= 150 ? "現在地を取得しました。精度が低い可能性があります。" : "現在地を取得しました。");
        searchNearby(nextPosition);
      },
      error => {
        setLocationState("error");
        setLocationMessage(geoErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  }

  function stopLocation() {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    nearbyAbort.current?.abort();
    setLocationState("idle");
    setLocationMessage("位置情報を停止しました。");
    setNearbyState("idle");
    setNearbyMessage("");
    setNearbyPlaces([]);
  }

  function completeItem(item) {
    const now = new Date().toISOString();
    persistDay(current => ({ ...current, items: current.items.map(value => value.id === item.id ? { ...value, completedAt: value.completedAt || now } : value) }));
  }

  function checkIn(item) {
    if (!position) {
      setLocationMessage("現在地を取得してからチェックインしてください。");
      return;
    }
    if (!window.confirm(`「${item.name}」に到着として記録しますか？`)) return;
    const now = new Date().toISOString();
    persistDay(current => ({
      ...current,
      items: current.items.map(value => value.id === item.id ? {
        ...value,
        completedAt: value.completedAt || now,
        checkedInAt: now,
        checkinLat: position.lat,
        checkinLng: position.lng,
        checkinAccuracy: position.accuracy,
      } : value),
    }));
    setMemoryItemId(item.id);
    setMemoryMemo(item.travelMemo || "");
    setMemoryMessage("到着を記録しました。写真やひとことを残せます。");
  }

  function openTravelMemory(item) {
    setMemoryItemId(item.id);
    setMemoryMemo(item.travelMemo || "");
    setMemoryMessage("");
  }

  async function saveTravelMemory(item, event) {
    event.preventDefault();
    if (memoryBusy) return;
    setMemoryBusy(true);
    setMemoryMessage("");
    try {
      const input = event.currentTarget.elements.namedItem("travelPhoto");
      const file = input?.files?.[0] || null;
      let photoAdded = 0;
      if (file) {
        const currentCount = await countPrefecturePhotos(plan.prefectureId);
        if (currentCount >= MAX_PREFECTURE_PHOTOS) {
          throw new Error(`この都道府県には写真を${MAX_PREFECTURE_PHOTOS}枚まで保存できます。`);
        }
        const blob = await compressTravelPhoto(file);
        await saveTravelPhoto({
          prefectureId: plan.prefectureId,
          planId: plan.id,
          dayId: day.id,
          itemId: item.id,
          blob,
        });
        photoAdded = 1;
      }

      const memo = memoryMemo.trim();
      persistDay(current => ({
        ...current,
        items: current.items.map(value => value.id === item.id ? {
          ...value,
          travelMemo: memo,
          travelPhotoCount: Math.max(0, Number(value.travelPhotoCount) || 0) + photoAdded,
        } : value),
      }));
      setMemoryMessage(photoAdded ? "✓ 写真とひとことを保存しました。" : "✓ ひとことを保存しました。");
      setMemoryItemId("");
      setMemoryMemo("");
    } catch (error) {
      setMemoryMessage(error.message || "写真・ひとことを保存できませんでした。");
    } finally {
      setMemoryBusy(false);
    }
  }

  function openStopMemory(stop) {
    setMemoryStopId(stop.id);
    setMemoryStopMemo(stop.travelMemo || "");
    setMemoryStopMessage("");
  }

  async function saveStopMemory(stop, event) {
    event.preventDefault();
    if (memoryStopBusy) return;
    setMemoryStopBusy(true);
    setMemoryStopMessage("");
    try {
      const input = event.currentTarget.elements.namedItem("travelStopPhoto");
      const file = input?.files?.[0] || null;
      let photoAdded = 0;
      if (file) {
        const currentCount = await countPrefecturePhotos(plan.prefectureId);
        if (currentCount >= MAX_PREFECTURE_PHOTOS) {
          throw new Error(`この都道府県には写真を${MAX_PREFECTURE_PHOTOS}枚まで保存できます。`);
        }
        const blob = await compressTravelPhoto(file);
        await saveTravelPhoto({
          prefectureId: plan.prefectureId,
          planId: plan.id,
          dayId: day.id,
          itemId: stop.id,
          blob,
        });
        photoAdded = 1;
      }

      const memo = memoryStopMemo.trim();
      persistDay(current => ({
        ...current,
        extraStops: (current.extraStops || []).map(value => value.id === stop.id ? {
          ...value,
          travelMemo: memo,
          travelPhotoCount: Math.max(0, Number(value.travelPhotoCount) || 0) + photoAdded,
        } : value),
      }));
      setMemoryStopMessage(photoAdded ? "✓ 写真とひとことを保存しました。" : "✓ ひとことを保存しました。");
      setMemoryStopId("");
      setMemoryStopMemo("");
    } catch (error) {
      setMemoryStopMessage(error.message || "写真・ひとことを保存できませんでした。");
    } finally {
      setMemoryStopBusy(false);
    }
  }

  function saveSuggestedPlace(place) {
    if (!window.confirm(`「${place.name}」に立ち寄った記録を保存しますか？`)) return;
    const existing = (day.extraStops || []).some(stop => stop.placeId && stop.placeId === place.id);
    if (existing) {
      setNearbyMessage("この場所はすでに立ち寄り記録へ保存されています。");
      return;
    }
    const stop = {
      id: newId(),
      name: place.name,
      memo: place.address || "",
      visitedAt: new Date().toISOString(),
      lat: position?.lat ?? place.lat ?? null,
      lng: position?.lng ?? place.lng ?? null,
      accuracy: position?.accuracy ?? null,
      placeId: place.id,
      placeName: place.name,
      placeSource: "geoapify",
    };
    persistDay(current => ({ ...current, extraStops: [...(current.extraStops || []), stop] }));
    setNearbyMessage(`✓ ${place.name} を立ち寄り記録に保存しました。`);
  }

  function addExtraStop(event) {
    event.preventDefault();
    const name = extraName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const stop = {
      id: newId(),
      name,
      memo: extraMemo.trim(),
      visitedAt: now,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracy: position?.accuracy ?? null,
      placeId: "",
      placeName: "",
      placeSource: "manual",
    };
    persistDay(current => ({ ...current, extraStops: [...(current.extraStops || []), stop] }));
    setExtraName("");
    setExtraMemo("");
    setExtraOpen(false);
  }

  function showSummary(targetPlan = plan) {
    if (watchId.current !== null) stopLocation();
    setFinishBusy(false);
    setFinishMessage("");
    setFinishedPlan(targetPlan);
  }

  function finishTrip() {
    if (finishBusy) return;
    if (plan.travelBookSavedAt) {
      showSummary(plan);
      return;
    }
    if (!window.confirm("旅行を終了して、旅ログ・写真・ひとことを旅図帳の思い出に保存しますか？")) return;
    setFinishBusy(true);
    setFinishMessage("旅図帳に保存しています…");
    const result = onFinish?.(plan);
    if (!result || result.error) {
      setFinishBusy(false);
      setFinishMessage(result?.error || "旅行を終了できませんでした。もう一度お試しください。");
      return;
    }
    showSummary(result.saved || plan);
  }

  const dateRange = useMemo(() => {
    if (!plan.startDate && !plan.endDate) return "日程未設定";
    return `${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`;
  }, [plan.startDate, plan.endDate]);

  if (finishedPlan) return <TravelSummary plan={finishedPlan} onClose={onClose} onOpenMemory={() => onOpenMemory?.(finishedPlan.prefectureId)} />;

  return <section className="travel-mode" aria-labelledby="travel-mode-title">
    <header className="travel-mode-header">
      <div><p className="section-kicker">TRAVEL MODE</p><h1 id="travel-mode-title">{plan.title}</h1><p>{dateRange}</p></div>
      <button type="button" onClick={onClose}>計画に戻る</button>
    </header>

    <section className="travel-location" aria-labelledby="location-title">
      <div><h2 id="location-title">現在地チェックイン</h2><p>旅行中の現在地を使って、訪れた場所と到着時刻をこの端末の旅行計画に記録できます。位置情報を有効にすると、近くのお店や観光スポットも自動で候補表示します。</p></div>
      <div className="travel-location-actions">
        {watchId.current === null ? <button type="button" className="travel-primary" onClick={startLocation}>位置情報を使う</button> : <><button type="button" onClick={stopLocation}>位置情報を停止</button><button type="button" onClick={() => searchNearby(position, { force: true })} disabled={!position || nearbyState === "loading"}>近くを再検索</button></>}
      </div>
      <p className={`travel-location-status ${locationState}`} role="status">{locationMessage || "位置情報はまだ使用していません。"}</p>
    </section>

    {plannedArrival && <section className="travel-arrival" aria-labelledby="planned-arrival-title">
      <p className="section-kicker">ARRIVAL</p>
      <h2 id="planned-arrival-title">「{plannedArrival.item.name}」に到着しましたか？</h2>
      <p>周辺データの「{plannedArrival.place.name}」が現在地から約{plannedArrival.place.distance}mです。実際に到着していれば記録できます。</p>
      <button type="button" className="travel-primary" onClick={() => checkIn(plannedArrival.item)}>到着として記録</button>
    </section>}

    {watchId.current !== null && <section className="travel-nearby" aria-labelledby="nearby-title">
      <div className="travel-nearby-heading"><div><p className="section-kicker">NEARBY</p><h2 id="nearby-title">この場所に立ち寄りましたか？</h2></div>{nearbyState === "loading" && <span>検索中…</span>}</div>
      <p className={`travel-nearby-status ${nearbyState}`} role="status">{nearbyMessage || "現在地が取れると周辺候補を表示します。"}</p>
      {nearbyPlaces.length > 0 && <div className="travel-nearby-list">{nearbyPlaces.map(place => <article key={place.id} className="travel-nearby-card">
        <div><h3>{place.name}</h3><p>{place.distance !== null ? `現在地から約${place.distance}m` : "現在地の近く"}</p>{place.address && <small>{place.address}</small>}</div>
        <button type="button" className="travel-primary" onClick={() => saveSuggestedPlace(place)}>立ち寄った</button>
      </article>)}</div>}
      <p className="travel-nearby-note">候補は現在地周辺のデータから表示しています。GPSや店舗データの誤差があるため、自動では保存せず確認後に記録します。</p>
    </section>}

    {plan.days.length > 1 && <nav className="travel-day-tabs" aria-label="旅行日を選択">
      {plan.days.map((value, index) => <button type="button" key={value.id} className={index === dayIndex ? "active" : ""} onClick={() => setDayIndex(index)}>{index + 1}日目{value.date === today ? "・今日" : ""}</button>)}
    </nav>}

    <section className="travel-progress" aria-labelledby="travel-day-title">
      <div><p>{dayLabel}</p><h2 id="travel-day-title">{dayIndex + 1}日目の予定</h2></div>
      <strong>{completedCount} / {day.items.length} 完了</strong>
      <div className="travel-progress-bar" aria-label={`進捗 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
    </section>

    <section className="travel-next" aria-labelledby="next-title">
      <p className="section-kicker">NEXT</p>
      {nextItem ? <><h2 id="next-title">次の予定</h2><div className="travel-next-card"><time>{nextItem.time || "時刻未定"}</time><strong>{nextItem.name}</strong>{nextTiming && <span className={`travel-next-timing ${nextTiming.kind}`}>{nextTiming.text}</span>}{nextItem.memo && <p>{nextItem.memo}</p>}{googleMapsRouteForItem(nextItem) ? <a className="travel-route-link" href={googleMapsRouteForItem(nextItem)} target="_blank" rel="noopener noreferrer">Googleマップで経路を確認 ↗</a> : googleMapsNavigationForItem(nextItem) && <a className="travel-route-link" href={googleMapsNavigationForItem(nextItem)} target="_blank" rel="noopener noreferrer">現在地からナビ ↗</a>}</div>
        {day.items[nextIndex + 1] && <p className="travel-after-next">その次：{day.items[nextIndex + 1].time || "時刻未定"} {day.items[nextIndex + 1].name}</p>}</> : <><h2 id="next-title">今日の予定はすべて完了しました 🎉</h2><p>おつかれさまでした。予定外の立ち寄りも記録できます。</p></>}
    </section>

    <section className="travel-log" aria-labelledby="travel-log-title">
      <div className="travel-log-heading">
        <div><p className="section-kicker">TRAVEL LOG</p><h2 id="travel-log-title">{travelLogTitle}</h2></div>
        <strong>{travelLog.length}件</strong>
      </div>
      {travelLog.length === 0 ? <p className="travel-log-empty">まだ旅ログはありません。チェックインや立ち寄りを記録すると、ここに時刻順で追加されます。</p> : <ol className="travel-log-list">
        {travelLog.map(entry => <li key={entry.id}>
          <time dateTime={entry.at}>{formatTime(entry.at)}</time>
          <div className="travel-log-dot" aria-hidden="true" />
          <div className="travel-log-card">
            <div className="travel-log-card-heading"><span>{entry.kind}</span><h3>{entry.name}</h3></div>
            {entry.memo && <p>「{entry.memo}」</p>}
            {entry.photoCount > 0 && <small>📷 写真 {entry.photoCount}枚</small>}
          </div>
        </li>)}
      </ol>}
      <div className="travel-log-share-wrap">
        <TravelLogShare title={plan.title} dayLabel={travelLogTitle} dayDate={day.date} entries={travelLog} planId={plan.id} />
      </div>
    </section>

    <ol className="travel-timeline">
      {day.items.map((item, index) => {
        const done = Boolean(item.completedAt || item.checkedInAt);
        return <li key={item.id} className={done ? "done" : ""}>
          <div className="travel-time">{item.time || "--:--"}</div>
          <div className="travel-event"><div className="travel-event-title"><span className="travel-step">{index + 1}</span><h3>{item.name}</h3></div>{item.memo && <p>{item.memo}</p>}
            {googleMapsRouteForItem(item) ? <a className="travel-route-link" href={googleMapsRouteForItem(item)} target="_blank" rel="noopener noreferrer">Googleマップで経路を確認 ↗</a> : googleMapsNavigationForItem(item) && <a className="travel-route-link" href={googleMapsNavigationForItem(item)} target="_blank" rel="noopener noreferrer">現在地からナビ ↗</a>}
            {item.checkedInAt && <p className="travel-success">✓ {formatTime(item.checkedInAt)}にチェックイン</p>}
            {!item.checkedInAt && item.completedAt && <p className="travel-success">✓ {formatTime(item.completedAt)}に完了</p>}
            {item.travelMemo && <p className="travel-memory-summary">ひとこと：{item.travelMemo}</p>}
            {item.travelPhotoCount > 0 && <p className="travel-memory-summary">📷 写真 {item.travelPhotoCount}枚保存済み</p>}
            <div className="travel-event-actions">
              {!done && <button type="button" onClick={() => completeItem(item)}>完了</button>}
              {!item.checkedInAt && <button type="button" className="travel-primary" onClick={() => checkIn(item)}>この場所に到着</button>}
              {item.checkedInAt && <button type="button" onClick={() => openTravelMemory(item)}>写真・ひとこと</button>}
            </div>
            {memoryItemId === item.id && <form className="travel-memory-form" onSubmit={event => saveTravelMemory(item, event)}>
              <label>ひとこと<textarea rows={3} maxLength={500} value={memoryMemo} onChange={event => setMemoryMemo(event.target.value)} placeholder="景色がきれいだった、○○がおいしかった など" /></label>
              <label>写真（1枚）<input name="travelPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/gif" /></label>
              <p className="travel-memory-note">写真はこの都道府県の「思い出」にも保存されます。1県につき最大{MAX_PREFECTURE_PHOTOS}枚です。</p>
              {memoryMessage && <p className="travel-memory-status" role="status">{memoryMessage}</p>}
              <div className="travel-event-actions"><button className="travel-primary" type="submit" disabled={memoryBusy}>{memoryBusy ? "保存中…" : "保存する"}</button><button type="button" disabled={memoryBusy} onClick={() => { setMemoryItemId(""); setMemoryMemo(""); setMemoryMessage(""); }}>閉じる</button></div>
            </form>}
          </div>
        </li>;
      })}
    </ol>

    <section className="travel-extra" aria-labelledby="extra-title">
      <h2 id="extra-title">予定外の立ち寄り</h2>
      <p>予定になかったお店やスポットも、その場で記録できます。</p>
      {!extraOpen ? <button type="button" onClick={() => setExtraOpen(true)}>＋ 予定外の立ち寄りを記録</button> : <form onSubmit={addExtraStop}>
        <label>場所名<input maxLength={200} required value={extraName} onChange={event => setExtraName(event.target.value)} placeholder="カフェ、神社、おみやげ店など" /></label>
        <label>メモ<textarea rows={3} maxLength={1000} value={extraMemo} onChange={event => setExtraMemo(event.target.value)} /></label>
        <div className="travel-event-actions"><button className="travel-primary" type="submit">立ち寄りを保存</button><button type="button" onClick={() => setExtraOpen(false)}>キャンセル</button></div>
      </form>}
      {(day.extraStops || []).length > 0 && <ul className="travel-extra-list">{day.extraStops.map(stop => <li key={stop.id}>
        <strong>{stop.name}</strong><span>{formatTime(stop.visitedAt)}</span>
        {stop.memo && <p>{stop.memo}</p>}
        {stop.travelMemo && <p className="travel-memory-summary">ひとこと：{stop.travelMemo}</p>}
        {stop.travelPhotoCount > 0 && <p className="travel-memory-summary">📷 写真 {stop.travelPhotoCount}枚保存済み</p>}
        {stop.lat !== null && <small>位置情報付きで保存済み{stop.placeSource === "geoapify" ? "・周辺候補から追加" : ""}</small>}
        <div className="travel-event-actions"><button type="button" onClick={() => openStopMemory(stop)}>写真・ひとこと</button></div>
        {memoryStopId === stop.id && <form className="travel-memory-form" onSubmit={event => saveStopMemory(stop, event)}>
          <label>ひとこと<textarea rows={3} maxLength={500} value={memoryStopMemo} onChange={event => setMemoryStopMemo(event.target.value)} placeholder="おいしかった、雰囲気がよかった など" /></label>
          <label>写真（1枚）<input name="travelStopPhoto" type="file" accept="image/jpeg,image/png,image/webp,image/gif" /></label>
          <p className="travel-memory-note">写真はこの都道府県の「思い出」にも保存されます。1県につき最大{MAX_PREFECTURE_PHOTOS}枚です。</p>
          {memoryStopMessage && <p className="travel-memory-status" role="status">{memoryStopMessage}</p>}
          <div className="travel-event-actions"><button className="travel-primary" type="submit" disabled={memoryStopBusy}>{memoryStopBusy ? "保存中…" : "保存する"}</button><button type="button" disabled={memoryStopBusy} onClick={() => { setMemoryStopId(""); setMemoryStopMemo(""); setMemoryStopMessage(""); }}>閉じる</button></div>
        </form>}
      </li>)}</ul>}
    </section>

    <section className="travel-finish" aria-labelledby="travel-finish-title">
      <p className="section-kicker">FINISH TRIP</p>
      <h2 id="travel-finish-title">旅行を終了</h2>
      {plan.travelBookSavedAt ? <>
        <p className="travel-finish-saved">✓ この旅行は旅図帳の思い出に保存済みです。</p>
        <div className="travel-event-actions"><button type="button" className="travel-primary" onClick={() => showSummary(plan)}>旅のまとめを見る</button><button type="button" onClick={onClose}>計画に戻る</button></div>
      </> : <>
        <p>旅行が終わったら、ここから旅ログ・写真・ひとことをまとめて旅図帳の思い出へ保存できます。</p>
        <button type="button" className="travel-finish-primary" disabled={finishBusy} onClick={finishTrip}>{finishBusy ? "保存中…" : "旅行を終了して旅図帳に保存"}</button>
        <small>保存後も、都道府県の思い出画面から文章や写真を編集できます。</small>
      </>}
      {finishMessage && <p className="travel-finish-status" role="status">{finishMessage}</p>}
    </section>
  </section>;
}
