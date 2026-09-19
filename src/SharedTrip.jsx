import React, { useEffect, useState } from "react";
import prefectures from "./prefectures.json";
import { readTripFragment, SHARE_FIELDS, SHARE_ROUTE_FIELDS, tripDuration } from "./tripShare.js";
import "./tripShare.css";
import CopySharedTrip from "./CopySharedTrip.jsx";
import { googleMapsPlaceForItem, googleMapsRouteForItem } from "./tripRoute.js";

export default function SharedTrip() {
  const [copyOpen, setCopyOpen] = useState(false);
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    function load() { setCopyOpen(false); setState({ loading: true }); const hash = location.hash; readTripFragment(hash).then(plan => { if (active && hash === location.hash) setState({ plan }); }).catch(error => { if (active && hash === location.hash) setState({ error: true, unsupported: error.message?.startsWith("圧縮リンクに対応") ? error.message : "" }); }); }
    load(); window.addEventListener("hashchange", load);
    return () => { active = false; window.removeEventListener("hashchange", load); };
  }, []);
  const plan = state.plan; const duration = plan && tripDuration(plan);
  return <main className="shared-trip">
    <header><a href="/">旅図帳</a><p className="section-kicker">共有された旅のしおり</p>
      <h1>{plan ? plan.title : state.loading ? "しおりを読み込み中…" : "この共有リンクを読み込めませんでした。"}</h1>
      {plan && <><p>{prefectures.find(p => p.id === plan.prefectureId)?.name}</p><p>{plan.startDate || "出発日未定"} 〜 {plan.endDate || "帰宅日未定"}</p>{duration && <p>{duration === 1 ? "日帰り" : `${duration - 1}泊${duration}日`}</p>}<small>閲覧専用・作成時点の旅程です</small></>}
    </header>
    {state.error && <p role="alert">{state.unsupported || "リンクが途中で切れていないか確認し、送信者に再共有を依頼してください。"}</p>}
    {plan && <>
      {plan.days.length === 0 && <p>スケジュールはまだ登録されていません。</p>}
      {plan.days.map((day, index) => <section className="shared-day" key={index} aria-labelledby={`shared-day-${index}`}><h2 id={`shared-day-${index}`}>DAY {index + 1} <small>{day.date || "日付未定"}</small></h2>
        {day.items.length === 0 && <p>この日の予定は未定です。</p>}
        <ol>{day.items.map((item, i) => { const routeUrl = googleMapsRouteForItem(item); const placeUrl = googleMapsPlaceForItem(item); return <li key={i}><time>{item.time || "時刻未定"}</time><div><h3>{item.name}</h3>{item.memo && <p>{item.memo}</p>}{routeUrl ? <a className="shared-route-link" href={routeUrl} target="_blank" rel="noopener noreferrer">Googleマップで経路を確認 ↗</a> : placeUrl && <a className="shared-route-link" href={placeUrl} target="_blank" rel="noopener noreferrer">Googleマップで場所を確認 ↗</a>}</div></li>; })}</ol>
      </section>)}
      {(plan.departureLocation || plan.departureTime || plan.returnLocation || plan.returnTime) && <section className="shared-day shared-route-summary"><h2>出発・帰着</h2>
        {(plan.departureLocation || plan.departureTime) && <p><strong>出発：</strong>{plan.departureLocation || "地点未共有"}{plan.departureTime ? `　${plan.departureTime}ごろ` : ""}</p>}
        {(plan.returnLocation || plan.returnTime) && <p><strong>最終到着：</strong>{plan.returnLocation || "地点未共有"}{plan.returnTime ? `　${plan.returnTime}まで` : ""}</p>}
      </section>}
      {SHARE_FIELDS.filter(([key]) => !SHARE_ROUTE_FIELDS.has(key) && plan[key]).map(([key, label]) => <section className="shared-day" key={key}><h2>{label}</h2><p className="shared-note">{plan[key]}{key === "budget" ? " 円" : ""}</p></section>)}
    </>}
    <footer><h2>旅図帳とは？</h2><p>旅図帳は、旅行を計画して、旅が終わったら思い出を日本地図に残せるサービスです。</p><p>無料・登録不要</p>
      {plan && <p><button className="trip-link-button" type="button" aria-haspopup="dialog" onClick={() => setCopyOpen(true)}>このしおりを自分の旅の計画にコピー</button></p>}
      <a href="/">旅図帳で自分の旅を作る</a></footer>
    {copyOpen && plan && <CopySharedTrip plan={plan} onClose={() => setCopyOpen(false)} />}
  </main>;
}
