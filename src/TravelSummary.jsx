import React, { useMemo } from "react";
import TravelSummaryShare from "./TravelSummaryShare.jsx";

function formatTime(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(day, index) {
  if (!day.date) return `${index + 1}日目`;
  try {
    return new Date(`${day.date}T00:00:00`).toLocaleDateString("ja-JP", { month: "long", day: "numeric" });
  } catch {
    return day.date;
  }
}

function entriesForDay(day) {
  const scheduled = (day.items || [])
    .filter(item => item.checkedInAt || item.completedAt)
    .map(item => ({
      id: `item:${item.id}`,
      name: item.name || "予定",
      at: item.checkedInAt || item.completedAt,
      kind: item.checkedInAt ? "チェックイン" : "完了",
      memo: item.travelMemo || "",
      photoCount: Math.max(0, Number(item.travelPhotoCount) || 0),
    }));

  const extras = (day.extraStops || [])
    .filter(stop => stop.visitedAt)
    .map(stop => ({
      id: `stop:${stop.id}`,
      name: stop.name || "立ち寄り",
      at: stop.visitedAt,
      kind: "立ち寄り",
      memo: stop.travelMemo || "",
      photoCount: Math.max(0, Number(stop.travelPhotoCount) || 0),
    }));

  return [...scheduled, ...extras].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export default function TravelSummary({ plan, onClose, onOpenMemory, closeLabel = "計画に戻る" }) {
  const summary = useMemo(() => {
    const days = (plan.days || []).map((day, index) => ({
      id: day.id || String(index),
      label: dayLabel(day, index),
      entries: entriesForDay(day),
    })).filter(day => day.entries.length > 0);

    const entries = days.flatMap(day => day.entries);
    const placeCount = new Set(entries.map(entry => entry.name.trim()).filter(Boolean)).size;
    const photoCount = entries.reduce((sum, entry) => sum + entry.photoCount, 0);
    const memoCount = entries.filter(entry => entry.memo.trim()).length;

    return { days, entries, placeCount, photoCount, memoCount };
  }, [plan]);

  const dateRange = plan.startDate || plan.endDate
    ? `${plan.startDate || "未定"} 〜 ${plan.endDate || "未定"}`
    : "日程未設定";

  return <section className="travel-summary" aria-labelledby="travel-summary-title">
    <div className="travel-summary-hero">
      <p className="section-kicker">TRIP COMPLETE</p>
      <span className="travel-summary-check" aria-hidden="true">✓</span>
      <h1 id="travel-summary-title">旅のまとめ</h1>
      <h2>{plan.title || "旅行"}</h2>
      <p>{dateRange}</p>
      <p className="travel-summary-saved">旅図帳の思い出に保存しました。</p>
    </div>

    <div className="travel-summary-stats" aria-label="旅行の記録数">
      <div><strong>{summary.placeCount}</strong><span>訪れた場所</span></div>
      <div><strong>{summary.photoCount}</strong><span>写真</span></div>
      <div><strong>{summary.entries.length}</strong><span>旅ログ</span></div>
      <div><strong>{summary.memoCount}</strong><span>ひとこと</span></div>
    </div>

    <section className="travel-summary-footprints" aria-labelledby="travel-summary-footprints-title">
      <div className="travel-summary-section-heading">
        <div><p className="section-kicker">YOUR FOOTPRINTS</p><h2 id="travel-summary-footprints-title">旅の足あと</h2></div>
        <strong>{summary.days.length}日分</strong>
      </div>

      {summary.days.length === 0 ? <p className="travel-summary-empty">チェックインや立ち寄りの記録はありません。写真や思い出は都道府県の思い出画面から確認できます。</p> :
        <div className="travel-summary-days">{summary.days.map(day => <section key={day.id} className="travel-summary-day">
          <h3>{day.label}</h3>
          <ol>{day.entries.map(entry => <li key={entry.id}>
            <time dateTime={entry.at}>{formatTime(entry.at)}</time>
            <div>
              <div className="travel-summary-entry-heading"><strong>{entry.name}</strong><span>{entry.kind}</span></div>
              {entry.memo && <p>「{entry.memo}」</p>}
              {entry.photoCount > 0 && <small>📷 写真 {entry.photoCount}枚</small>}
            </div>
          </li>)}</ol>
        </section>)}</div>}
    </section>

    <TravelSummaryShare plan={plan} summary={summary} />

    <div className="travel-summary-actions">
      <button type="button" className="travel-primary" onClick={onOpenMemory}>思い出を見る</button>
      <button type="button" onClick={onClose}>{closeLabel}</button>
    </div>
  </section>;
}
