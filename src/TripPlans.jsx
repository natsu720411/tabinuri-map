import React, { useEffect, useRef, useState } from "react";
import prefectures from "./prefectures.json";
import { loadPlans, newId, newPlan, persistPlans, todayLocal, TRIP_PLANS_KEY } from "./tripPlans.js";
import "./tripPlans.css";

const notes = [["places", "行きたい場所"], ["foods", "食べたいもの"], ["activities", "やりたいこと"], ["accommodation", "宿泊先メモ"], ["transport", "移動メモ"], ["notes", "その他メモ"]];

export default function TripPlans() {
  const [store, setStore] = useState(loadPlans);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const heading = useRef(null);
  const form = useRef(null);
  const editing = Boolean(draft);
  useEffect(() => { heading.current?.focus(); }, [editing]);
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
  function edit(plan) { setDraft(structuredClone(plan)); setDirty(false); setMessage(""); setError(""); }
  function update(key, value) { setDraft(previous => ({ ...previous, [key]: value })); setDirty(true); }
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
  function save(completed = false) {
    if (!form.current.reportValidity() || blocked) return;
    if (!draft.title.trim()) { setError("旅行タイトルを入力してください。"); return; }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) { setError("帰宅日は出発日以降にしてください。"); return; }
    if (draft.days.some(day => day.date && ((draft.startDate && day.date < draft.startDate) || (draft.endDate && day.date > draft.endDate)))) { setError("日ごとの日付は旅行の日程内にしてください。"); return; }
    if (draft.days.some(day => day.items.some(item => !item.name.trim()))) { setError("予定名を入力してください。"); return; }
    if (completed && (!draft.endDate || draft.endDate > todayLocal())) return;
    const saved = { ...draft, title: draft.title.trim(), status: completed ? "completed" : draft.status, updatedAt: new Date().toISOString() };
    const plans = store.plans.some(plan => plan.id === saved.id) ? store.plans.map(plan => plan.id === saved.id ? saved : plan) : [...store.plans, saved];
    if (commit(plans, completed ? "旅行済みにしました。地図・思い出への転記はまだ行いません。" : "旅行計画を保存しました。")) { setDraft(saved); setDirty(false); }
  }
  function close() { if (dirty && !window.confirm("未保存の変更を破棄して一覧に戻りますか？")) return; setDraft(null); setDirty(false); setError(""); }
  function removePlan() {
    if (!window.confirm(`「${draft.title || "この旅行"}」を削除しますか？`)) return;
    if (commit(store.plans.filter(plan => plan.id !== draft.id), "旅行計画を削除しました。")) { setDraft(null); setDirty(false); }
  }
  return <section className="trip-plans" aria-labelledby="trip-plans-title">
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
          <label>人数<input type="number" min="1" step="1" value={draft.people} onChange={event => update("people", event.target.value)} /></label>
          <label>誰と行くか<input maxLength={200} value={draft.companions} onChange={event => update("companions", event.target.value)} placeholder="友達、家族、一人旅など" /></label>
          <label>旅行全体の予算（円）<input type="number" min="0" step="1" value={draft.budget} onChange={event => update("budget", event.target.value)} /></label>
          <label>ステータス<select value={draft.status} onChange={event => update("status", event.target.value)}><option value="planning">計画中</option><option value="completed">旅行済み</option></select></label>
          {notes.map(([key, label]) => <label key={key}>{label}<textarea rows={3} value={draft[key]} onChange={event => update(key, event.target.value)} /></label>)}
        </div>
        <section className="trip-schedule" aria-labelledby="trip-schedule-title"><h2 id="trip-schedule-title">日ごとのスケジュール</h2><p>日付は未定でも作れます。予定は矢印で並び替えられます。</p>
          {draft.days.map((day, dayIndex) => <section key={day.id} className="trip-day" aria-labelledby={`day-${day.id}`}>
            <div className="trip-day-heading"><h3 id={`day-${day.id}`}>{dayIndex + 1}日目</h3><button type="button" onClick={() => { if (window.confirm(`${dayIndex + 1}日目の予定をすべて削除しますか？`)) update("days", draft.days.filter(value => value.id !== day.id)); }}>この日を削除</button></div>
            <label>{dayIndex + 1}日目の日付<input type="date" min={draft.startDate || undefined} max={draft.endDate || undefined} value={day.date} onChange={event => updateDay(day.id, value => ({ ...value, date: event.target.value }))} /></label>
            {day.items.map((item, index) => <fieldset className="trip-item" key={item.id}><legend>予定 {index + 1}</legend>
              <div className="trip-item-fields"><label>時刻<input type="time" value={item.time} onChange={event => updateItem(day.id, item.id, "time", event.target.value)} /></label><label>場所・予定名（必須）<input required value={item.name} onChange={event => updateItem(day.id, item.id, "name", event.target.value)} placeholder="清水寺を散策" /></label></div>
              <label>メモ<textarea rows={2} value={item.memo} onChange={event => updateItem(day.id, item.id, "memo", event.target.value)} /></label>
              <div className="trip-actions"><button type="button" disabled={index === 0} aria-label={`${dayIndex + 1}日目の予定${index + 1}を上へ`} onClick={() => move(day.id, index, -1)}>↑ 上へ</button><button type="button" disabled={index === day.items.length - 1} aria-label={`${dayIndex + 1}日目の予定${index + 1}を下へ`} onClick={() => move(day.id, index, 1)}>↓ 下へ</button><button type="button" onClick={() => { if (window.confirm("この予定を削除しますか？")) updateDay(day.id, value => ({ ...value, items: value.items.filter(value => value.id !== item.id) })); }}>予定を削除</button></div>
            </fieldset>)}
            <button type="button" onClick={() => updateDay(day.id, value => ({ ...value, items: [...value.items, { id: newId(), time: "", name: "", memo: "" }] }))}>予定を追加</button>
          </section>)}
          <button type="button" onClick={() => update("days", [...draft.days, { id: newId(), date: "", items: [] }])}>日を追加</button>
        </section>
        <div className="trip-save"><button className="trip-primary" type="submit">計画を保存</button><span>{dirty ? "未保存の変更があります" : ""}</span></div>
        <section className="trip-finish"><h2>旅が終わったら</h2><p>今回は「旅行済み」への変更まで対応しています。訪問済みの県や写真・思い出には自動転記されません。</p>
          {draft.status === "completed" ? <p>この旅行は旅行済みです。</p> : <><button type="button" disabled={!draft.endDate || draft.endDate > todayLocal()} onClick={() => save(true)}>この旅行を旅図帳に保存</button><p>帰宅日を設定すると、その日以降に利用できます。入力中の計画も一緒に保存します。</p></>}
        </section>
        {store.plans.some(plan => plan.id === draft.id) && <button className="trip-delete" type="button" onClick={removePlan}>旅行計画を削除</button>}
      </fieldset>
    </form>}
  </section>;
}
