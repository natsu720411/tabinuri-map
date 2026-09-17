import React, { useEffect, useMemo, useRef, useState } from "react";
import { newId, todayLocal } from "./tripPlans.js";
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

export default function TravelMode({ plan, onClose, onPersist }) {
  const today = todayLocal();
  const initialDayIndex = Math.max(0, plan.days.findIndex(day => day.date === today));
  const [dayIndex, setDayIndex] = useState(initialDayIndex);
  const [position, setPosition] = useState(null);
  const [locationState, setLocationState] = useState("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [extraName, setExtraName] = useState("");
  const [extraMemo, setExtraMemo] = useState("");
  const watchId = useRef(null);

  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const day = plan.days[dayIndex] || { id: "", date: "", items: [], extraStops: [] };
  const completedCount = day.items.filter(item => item.completedAt || item.checkedInAt).length;
  const nextItem = day.items.find(item => !item.completedAt && !item.checkedInAt);
  const nextIndex = nextItem ? day.items.indexOf(nextItem) : -1;
  const dayLabel = day.date === today ? "今日" : day.date || `${dayIndex + 1}日目`;
  const progress = day.items.length ? Math.round((completedCount / day.items.length) * 100) : 0;

  const persistDay = (transform) => {
    const days = plan.days.map((value, index) => index === dayIndex ? transform(value) : value);
    onPersist({ ...plan, days, updatedAt: new Date().toISOString() });
  };

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
        setPosition({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, timestamp });
        setLocationState("ready");
        setLocationMessage(coords.accuracy >= 150 ? "現在地を取得しました。精度が低い可能性があります。" : "現在地を取得しました。");
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
    setLocationState("idle");
    setLocationMessage("位置情報を停止しました。");
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

  const dateRange = useMemo(() => {
    if (!plan.startDate && !plan.endDate) return "日程未設定";
    return `${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`;
  }, [plan.startDate, plan.endDate]);

  return <section className="travel-mode" aria-labelledby="travel-mode-title">
    <header className="travel-mode-header">
      <div><p className="section-kicker">TRAVEL MODE</p><h1 id="travel-mode-title">{plan.title}</h1><p>{dateRange}</p></div>
      <button type="button" onClick={onClose}>計画に戻る</button>
    </header>

    <section className="travel-location" aria-labelledby="location-title">
      <div><h2 id="location-title">現在地チェックイン</h2><p>旅行中の現在地を使って、訪れた場所と到着時刻をこの端末の旅行計画に記録できます。位置情報は外部サーバーへ送信しません。</p></div>
      <div className="travel-location-actions">
        {watchId.current === null ? <button type="button" className="travel-primary" onClick={startLocation}>位置情報を使う</button> : <button type="button" onClick={stopLocation}>位置情報を停止</button>}
      </div>
      <p className={`travel-location-status ${locationState}`} role="status">{locationMessage || "位置情報はまだ使用していません。"}</p>
    </section>

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
      {nextItem ? <><h2 id="next-title">次の予定</h2><div className="travel-next-card"><time>{nextItem.time || "時刻未定"}</time><strong>{nextItem.name}</strong>{nextItem.memo && <p>{nextItem.memo}</p>}</div>
        {day.items[nextIndex + 1] && <p className="travel-after-next">その次：{day.items[nextIndex + 1].time || "時刻未定"} {day.items[nextIndex + 1].name}</p>}</> : <><h2 id="next-title">今日の予定はすべて完了しました 🎉</h2><p>おつかれさまでした。予定外の立ち寄りも記録できます。</p></>}
    </section>

    <ol className="travel-timeline">
      {day.items.map((item, index) => {
        const done = Boolean(item.completedAt || item.checkedInAt);
        return <li key={item.id} className={done ? "done" : ""}>
          <div className="travel-time">{item.time || "--:--"}</div>
          <div className="travel-event"><div className="travel-event-title"><span className="travel-step">{index + 1}</span><h3>{item.name}</h3></div>{item.memo && <p>{item.memo}</p>}
            {item.checkedInAt && <p className="travel-success">✓ {formatTime(item.checkedInAt)}にチェックイン</p>}
            {!item.checkedInAt && item.completedAt && <p className="travel-success">✓ {formatTime(item.completedAt)}に完了</p>}
            <div className="travel-event-actions">
              {!done && <button type="button" onClick={() => completeItem(item)}>完了</button>}
              {!item.checkedInAt && <button type="button" className="travel-primary" onClick={() => checkIn(item)}>この場所に到着</button>}
            </div>
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
      {(day.extraStops || []).length > 0 && <ul className="travel-extra-list">{day.extraStops.map(stop => <li key={stop.id}><strong>{stop.name}</strong><span>{formatTime(stop.visitedAt)}</span>{stop.memo && <p>{stop.memo}</p>}{stop.lat !== null && <small>位置情報付きで保存済み</small>}</li>)}</ul>}
    </section>
  </section>;
}
