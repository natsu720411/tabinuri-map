import React, { useEffect, useRef, useState } from "react";
import prefectures from "./prefectures.json";
import { loadPlans, newId, newPlan, persistPlans, todayLocal, TRIP_PLANS_KEY } from "./tripPlans.js";
import "./tripPlans.css";
import TripAI from "./TripAI.jsx";
import TripImport from "./TripImport.jsx";
import TripShare from "./TripShare.jsx";
import TravelMode from "./TravelMode.jsx";
import { importDefaults } from "./tripMemory.js";
import { googleMapsPlaceForItem, googleMapsRouteForItem } from "./tripRoute.js";

const notes = [["places", "行きたい場所"], ["foods", "食べたいもの"], ["activities", "やりたいこと"], ["accommodation", "宿泊先メモ"], ["transport", "移動メモ"], ["notes", "その他メモ"]];

export default function TripPlans({ onImport, onOpenMemory, initialPlanId, onInitialPlanOpened }) {
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [travelOpen, setTravelOpen] = useState(false);
  const [importedPrefecture, setImportedPrefecture] = useState(null);
  const [toast, setToast] = useState("");
  const [store, setStore] = useState(loadPlans);
  const [draft, setDraft] = useState(() => store.plans.find(plan => plan.id === initialPlanId) || null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimer = useRef(null);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  function clearFeedback() { clearTimeout(feedbackTimer.current); setSaveFeedback(false); }
  function showSaved(text = "✓ 旅の計画を保存しました") { clearTimeout(feedbackTimer.current); setToast(text); setSaveFeedback(true); feedbackTimer.current = setTimeout(() => setSaveFeedback(false), 2800); }
  const heading = useRef(null);
  const form = useRef(null);
  const editing = Boolean(draft);
  useEffect(() => { heading.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!initialPlanId) return;
    if (store.plans.some(plan => plan.id === initialPlanId)) setMessage("共有されたしおりをコピーした計画です。日程や予定を自由に変更できます。");
    else setError("計画が見つかりませんでした。旅行計画の一覧をご確認ください。");
    onInitialPlanOpened?.();
  }, [initialPlanId]);
  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const changed = event => { if (event.key === TRIP_PLANS_KEY || event.key === null) setConflict(true); };
    const leave = event => { if (dirty && !window.confirm("未保存の旅行計画の変更を破棄して移動しますか？")) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("storage", changed);
    window.addEventListener("trip-plan-leave", leave);
    return () => { window.removeEventListener("beforeunload", warn); window.removeEventListener("storage", changed); window.removeEventListener("trip-plan-leave", leave); };
  }, [dirty]);
  const blocked = Boolean(store.error || conflict);
  function edit(plan) { clearFeedback(); setImportedPrefecture(null); setDraft(structuredClone(plan)); setDirty(false); setMessage(""); setError(""); }
  function update(key, value) { clearFeedback(); setDraft(previous => ({ ...previous, [key]: value })); setDirty(true); }
  function updateDay(id, transform) { update("days", draft.days.map(day => day.id === id ? transform(day) : day)); }
  function updateItem(dayId, itemId, key, value) { updateDay(dayId, day => ({ ...day, items: day.items.map(item => item.id === itemId ? { ...item, [key]: value } : item) })); }
  function move(dayId, index, offset) {
    updateDay(dayId, day => { const items = [...day.items]; [items[index], items[index + offset]] = [items[index + offset], items[index]]; return { ...day, items }; });
  }
  function commit(plans, success) {
    if (blocked) return false;
    try { persistPlans(plans); setStore({ plans, error: "" }); setError(""); setMessage(success); return true; }
    catch { setError("保存できませんでした。空き容量やブラウザの保存設定をご確認ください。入力内容はこの画面に残っています。"); return false; }
  }
  function save() {
    clearFeedback();
    if (!form.current.reportValidity() || blocked) return;
    if (!draft.title.trim()) { setError("旅行タイトルを入力してください。"); return; }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) { setError("帰宅日は出発日以降にしてください。"); return; }
    if (draft.days.some(day => day.date && ((draft.startDate && day.date < draft.startDate) || (draft.endDate && day.date > draft.endDate)))) { setError("日ごとの日付は旅行の日程内にしてください。"); return; }
    if (draft.days.some(day => day.items.some(item => !item.name.trim()))) { setError("予定名を入力してください。"); return; }
    const saved = { ...draft, title: draft.title.trim(), updatedAt: new Date().toISOString() };
    const plans = store.plans.some(plan => plan.id === saved.id) ? store.plans.map(plan => plan.id === saved.id ? saved : plan) : [...store.plans, saved];
    if (commit(plans, "")) { setDraft(saved); setDirty(false); showSaved(); }
  }
  function persistTravelPlan(updated) {
    if (blocked) return;
    const plans = store.plans.map(plan => plan.id === updated.id ? updated : plan);
    try {
      persistPlans(plans);
      setStore({ plans, error: "" });
      setDraft(updated);
      setDirty(false);
      setError("");
      setMessage("旅行中の記録を保存しました。");
    } catch {
      setError("旅行中の記録を保存できませんでした。ブラウザの保存容量や設定をご確認ください。");
    }
  }
  function openTravelMode() {
    if (dirty || blocked || !store.plans.some(plan => plan.id === draft.id)) return;
    if (draft.days.length > 0) { setTravelOpen(true); return; }
    const today = todayLocal();
    const date = draft.startDate && draft.endDate && today >= draft.startDate && today <= draft.endDate ? today : (draft.startDate || today);
    const updated = { ...draft, days: [{ id: newId(), date, items: [], extraStops: [] }], updatedAt: new Date().toISOString() };
    const plans = store.plans.map(plan => plan.id === updated.id ? updated : plan);
    try {
      persistPlans(plans);
      setStore({ plans, error: "" });
      setDraft(updated);
      setDirty(false);
      setError("");
      setMessage("旅行中モード用に1日目を作成しました。");
      setTravelOpen(true);
    } catch {
      setError("旅行中モードを開始できませんでした。ブラウザの保存容量や設定をご確認ください。");
    }
  }
  function close() { if (dirty && !window.confirm("未保存の変更を破棄して一覧に戻りますか？")) return; clearFeedback(); setDraft(null); setDirty(false); setError(""); }
  function openImport() {
    if (blocked || !form.current.reportValidity()) return;
    if (!draft.title.trim() || !draft.endDate || draft.endDate > todayLocal() || (draft.startDate && draft.endDate < draft.startDate)) { setError("旅行タイトルと帰宅日までの日程を確認してください。"); return; }
    if (draft.days.some(day => day.date && ((draft.startDate && day.date < draft.startDate) || day.date > draft.endDate))) { setError("日ごとの日付は旅行の日程内にしてください。"); return; }
    if (draft.days.some(day => day.items.some(item => !item.name.trim()))) { setError("予定名を入力してください。"); return; }
    clearFeedback(); setImportOpen(true);
  }
  function saveTripToBook(planToSave, values) {
    if (blocked) return { error: "保存を停止しています。再読み込みしてください。" };
    const result = onImport(planToSave, values);
    if (result.error) return { error: result.error };
    const saved = { ...planToSave, title: planToSave.title.trim(), status: "completed", travelBookSavedAt: planToSave.travelBookSavedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const plans = store.plans.some(plan => plan.id === saved.id) ? store.plans.map(plan => plan.id === saved.id ? saved : plan) : [...store.plans, saved];
    if (!commit(plans, result.already ? "この旅行はすでに旅図帳に保存されています" : `${prefectures.find(p => p.id === result.prefectureId)?.name}を訪問済みにしました。`)) {
      return { error: "思い出への保存は完了しましたが、旅行計画の保存に失敗しました。空き容量をご確認のうえ再度保存してください。思い出は重複しません。" };
    }
    setDraft(saved);
    setDirty(false);
    setImportedPrefecture(result.prefectureId);
    showSaved("✓ 旅図帳に保存しました");
    return { error: "", already: result.already, prefectureId: result.prefectureId, saved };
  }
  function confirmImport(values) {
    const result = saveTripToBook(draft, values);
    if (result.error) return result.error;
    setImportOpen(false);
    return "";
  }
  function finishTravel(planToFinish) {
    if (!planToFinish?.title?.trim()) return { error: "旅行タイトルを入力してください。" };
    if (!Number.isInteger(planToFinish.prefectureId) || planToFinish.prefectureId < 1 || planToFinish.prefectureId > 47) return { error: "行き先の都道府県を設定してください。" };
    if (planToFinish.travelBookSavedAt) {
      setImportedPrefecture(planToFinish.prefectureId);
      setMessage("この旅行はすでに旅図帳に保存されています。");
      return { error: "", already: true, prefectureId: planToFinish.prefectureId, saved: planToFinish };
    }
    const result = saveTripToBook(planToFinish, importDefaults(planToFinish));
    if (result.error) return result;
    setMessage(result.already ? "この旅行はすでに旅図帳に保存されています。" : "旅行を終了し、旅ログ・写真・ひとことを旅図帳の思い出に保存しました。");
    return result;
  }
  function removePlan() {
    if (!window.confirm(`「${draft.title || "この旅行"}」を削除しますか？`)) return;
    if (commit(store.plans.filter(plan => plan.id !== draft.id), "旅行計画を削除しました。")) { setDraft(null); setDirty(false); }
  }
  if (travelOpen && draft) return <TravelMode plan={draft} onClose={() => setTravelOpen(false)} onPersist={persistTravelPlan} onFinish={finishTravel} onOpenMemory={prefectureId => { setTravelOpen(false); onOpenMemory(prefectureId); }} />;
  return <section className="trip-plans" aria-labelledby="trip-plans-title">
    <div className={saveFeedback ? "trip-toast" : "sr-only"} role="status" aria-live="polite" aria-atomic="true">{saveFeedback ? toast : ""}</div>
    <div className="trip-heading"><div><p className="section-kicker">PLAN YOUR NEXT TRIP</p><h1 id="trip-plans-title" ref={heading} tabIndex={-1}>{draft ? "旅の計画を編集" : "旅の計画"}</h1></div>
      {draft ? <button type="button" onClick={close}>一覧に戻る</button> : <button type="button" className="trip-primary" disabled={blocked} onClick={() => edit(newPlan())}>新しい旅行を計画する</button>}
    </div>
    <p>行きたい場所を、次の旅へ。日程や楽しみにしていることをまとめておきましょう。</p>
    <p className="trip-storage-note">計画はこのブラウザに保存されます。端末間の自動同期はありません。編集後は「計画を保存」を押してください。</p>
    {(store.error || conflict || error) && <p className="trip-error" role="alert">{store.error || (conflict ? "別のタブで旅行計画が変更されました。上書きを防ぐため保存を停止しています。入力を控えてから再読み込みしてください。" : error)}</p>}
    <p className="trip-status" role="status">{message}</p>
    {!draft ? <div className="trip-list">{store.plans.length === 0 && !blocked && <p className="trip-empty">まだ計画はありません。「新しい旅行を計画する」から始めましょう。</p>}
      {store.plans.map(plan => <button key={plan.id} type="button" className="trip-card" disabled={blocked} onClick={() => edit(plan)}>
        <span className="trip-badge">{plan.status === "completed" ? "旅行済み" : "計画中"}</span><h2>{plan.title}</h2>
        {plan.travelBookSavedAt && <p>✓ 旅図帳に保存済み</p>}
        <p>{prefectures.find(prefecture => prefecture.id === plan.prefectureId)?.name || "行き先未設定"}</p>
        <p>{plan.startDate || "出発日未定"} 〜 {plan.endDate || "帰宅日未定"}</p><p>誰と：{plan.companions || "未定"}</p>
      </button>)}
    </div> : <form ref={form} onSubmit={event => { event.preventDefault(); save(); }}>
      <fieldset disabled={blocked} className="trip-editor"><legend className="sr-only">旅行計画の入力</legend>
        <div className="trip-fields">
          <label>旅行タイトル（必須）<input required maxLength={120} value={draft.title} onChange={event => update("title", event.target.value)} placeholder="京都2泊3日旅行" /></label>
          <label>行き先（必須）<select required value={draft.prefectureId} onChange={event => update("prefectureId", Number(event.target.value))}><option value="">都道府県を選択</option>{prefectures.map(prefecture => <option key={prefecture.id} value={prefecture.id}>{prefecture.name}</option>)}</select></label>
          <label>出発日<input type="date" value={draft.startDate} onChange={event => update("startDate", event.target.value)} /></label>
          <label>帰宅日<input type="date" min={draft.startDate || undefined} value={draft.endDate} onChange={event => update("endDate", event.target.value)} /></label>
          <label>出発地点（AI旅程用）<input maxLength={200} value={draft.departureLocation || ""} onChange={event => update("departureLocation", event.target.value)} placeholder="例：名古屋駅、自宅最寄りの○○駅" /></label>
          <label>出発したい時刻（任意）<input type="time" value={draft.departureTime || ""} onChange={event => update("departureTime", event.target.value)} /></label>
          <label>最終到着地点（AI旅程用）<input maxLength={200} value={draft.returnLocation || ""} onChange={event => update("returnLocation", event.target.value)} placeholder="例：名古屋駅、自宅最寄りの○○駅" /></label>
          <label>最終到着したい時刻（任意）<input type="time" value={draft.returnTime || ""} onChange={event => update("returnTime", event.target.value)} /></label>
          <label>人数<input type="number" min="1" step="1" value={draft.people} onChange={event => update("people", event.target.value)} /></label>
          <label>誰と行くか<input maxLength={200} value={draft.companions} onChange={event => update("companions", event.target.value)} placeholder="友達、家族、一人旅など" /></label>
          <label>旅行全体の予算（円）<input type="number" min="0" step="1" value={draft.budget} onChange={event => update("budget", event.target.value)} /></label>
          <label>ステータス<select value={draft.status} onChange={event => update("status", event.target.value)}><option value="planning">計画中</option><option value="completed">旅行済み</option></select></label>
          {notes.map(([key, label]) => <label key={key}>{label}<textarea rows={3} value={draft[key]} onChange={event => update(key, event.target.value)} /></label>)}
        </div>
        <section className="trip-schedule" aria-labelledby="trip-schedule-title"><h2 id="trip-schedule-title">日ごとのスケジュール</h2><p>日付は未定でも作れます。予定は矢印で並び替えられます。</p>
          <button type="button" aria-haspopup="dialog" onClick={() => setAiOpen(true)}>✨ AIで旅程を作る</button>
          <p className="trip-storage-note">AI作成には行き先・出発日・帰宅日・出発地点・最終到着地点が必要です。希望時刻も入れると「8:00ごろ出発」「20:00までに到着」のように旅程へ反映します。駅名や空港名まで入れると、電車・バス・徒歩などの移動を詳しく提案しやすくなります。</p>
          {draft.days.map((day, dayIndex) => <section key={day.id} className="trip-day" aria-labelledby={`day-${day.id}`}>
            <div className="trip-day-heading"><h3 id={`day-${day.id}`}>{dayIndex + 1}日目</h3><button type="button" onClick={() => { if (window.confirm(`${dayIndex + 1}日目の予定をすべて削除しますか？`)) update("days", draft.days.filter(value => value.id !== day.id)); }}>この日を削除</button></div>
            <label>{dayIndex + 1}日目の日付<input type="date" min={draft.startDate || undefined} max={draft.endDate || undefined} value={day.date} onChange={event => updateDay(day.id, value => ({ ...value, date: event.target.value }))} /></label>
            {day.items.map((item, index) => <fieldset className="trip-item" key={item.id}><legend>予定 {index + 1}</legend>
              <div className="trip-item-fields"><label>時刻<input type="time" value={item.time} onChange={event => updateItem(day.id, item.id, "time", event.target.value)} /></label><label>場所・予定名（必須）<input required value={item.name} onChange={event => updateItem(day.id, item.id, "name", event.target.value)} placeholder="清水寺を散策" /></label></div>
              <label>メモ<textarea rows={2} value={item.memo} onChange={event => updateItem(day.id, item.id, "memo", event.target.value)} /></label>
              {googleMapsRouteForItem(item) ? <a className="trip-route-link" href={googleMapsRouteForItem(item)} target="_blank" rel="noopener noreferrer">Googleマップで経路を確認 ↗</a> : googleMapsPlaceForItem(item) && <a className="trip-route-link" href={googleMapsPlaceForItem(item)} target="_blank" rel="noopener noreferrer">Googleマップで場所を確認 ↗</a>}
              <div className="trip-actions"><button type="button" disabled={index === 0} aria-label={`${dayIndex + 1}日目の予定${index + 1}を上へ`} onClick={() => move(day.id, index, -1)}>↑ 上へ</button><button type="button" disabled={index === day.items.length - 1} aria-label={`${dayIndex + 1}日目の予定${index + 1}を下へ`} onClick={() => move(day.id, index, 1)}>↓ 下へ</button><button type="button" onClick={() => { if (window.confirm("この予定を削除しますか？")) updateDay(day.id, value => ({ ...value, items: value.items.filter(value => value.id !== item.id) })); }}>予定を削除</button></div>
            </fieldset>)}
            <button type="button" onClick={() => updateDay(day.id, value => ({ ...value, items: [...value.items, { id: newId(), time: "", name: "", memo: "" }] }))}>予定を追加</button>
          </section>)}
          <button type="button" onClick={() => update("days", [...draft.days, { id: newId(), date: "", items: [] }])}>日を追加</button>
        </section>
        <div className="trip-save"><button className="trip-primary" type="submit">{saveFeedback ? "✓ 保存しました" : "計画を保存"}</button><span>{dirty ? "未保存の変更があります" : ""}</span>
          {store.plans.find(plan => plan.id === draft.id)?.updatedAt && <small>最終保存：<time dateTime={store.plans.find(plan => plan.id === draft.id).updatedAt}>{new Date(store.plans.find(plan => plan.id === draft.id).updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}</time></small>}
        </div>
        <section className="trip-travel-mode"><h2>旅行中モード</h2><p>今日の予定を見ながら、完了チェックや現在地付きチェックインを記録できます。予定がまだなくても開始できます。</p><div className="trip-travel-mode-actions"><button type="button" className="trip-primary" disabled={dirty || blocked || !store.plans.some(plan => plan.id === draft.id)} onClick={openTravelMode}>旅行中モードを開く</button></div>{dirty && <p className="trip-storage-note">旅行中モードを使う前に「計画を保存」してください。</p>}</section>
        <section className="trip-finish"><h2>友達と予定をチェック</h2><p>共有する項目を選んで、閲覧専用の旅のしおりを送れます。</p><button type="button" aria-haspopup="dialog" onClick={() => setShareOpen(true)}>しおりを共有</button></section>
        <section className="trip-finish"><h2>旅が終わったら</h2><p>実際の旅の内容を確認して、行き先の都道府県に思い出を追記できます。</p>
          {draft.travelBookSavedAt ? <p>✓ 旅図帳に保存済み。この旅行はすでに旅図帳に保存されています。</p> : <><button type="button" aria-haspopup="dialog" disabled={!draft.endDate || draft.endDate > todayLocal()} onClick={openImport}>この旅行を旅図帳に保存</button><p>帰宅日を設定すると、その日以降に利用できます。入力中の計画も一緒に保存します。</p></>}
          {importedPrefecture && <button type="button" onClick={() => onOpenMemory(importedPrefecture)}>{prefectures.find(p => p.id === importedPrefecture)?.name}の思い出を見る</button>}
        </section>
        {store.plans.some(plan => plan.id === draft.id) && <button className="trip-delete" type="button" onClick={removePlan}>旅行計画を削除</button>}
      </fieldset>
    </form>}
    {aiOpen && draft && <TripAI plan={draft} blocked={blocked} onClose={() => setAiOpen(false)} onApply={days => { if (blocked) return; update("days", days); setAiOpen(false); setMessage("AI旅程を反映しました。内容を確認して「計画を保存」を押してください。"); }} />}
    {importOpen && draft && <TripImport plan={draft} prefectureName={prefectures.find(p => p.id === draft.prefectureId)?.name} blocked={blocked} onClose={() => setImportOpen(false)} onConfirm={confirmImport} />}
    {shareOpen && draft && <TripShare plan={draft} onClose={() => setShareOpen(false)} />}
  </section>;
}
