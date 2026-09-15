import React, { useEffect, useRef, useState } from "react";
import { importDefaults } from "./tripMemory.js";

export default function TripImport({ plan, prefectureName, onClose, onConfirm, blocked }) {
  const dialog = useRef(null);
  const [values, setValues] = useState(() => importDefaults(plan));
  const [error, setError] = useState("");
  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); if (opener?.isConnected) opener.focus?.(); };
  }, []);
  return <dialog className="trip-ai-dialog" ref={dialog} aria-labelledby="trip-import-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); if (!blocked) setError(onConfirm(values) || ""); }}>
      <h2 id="trip-import-title">旅図帳に保存</h2>
      <p>「{plan.title}」を{prefectureName}の思い出に追加します。既存の記録は削除せず追記します。写真はそのまま残ります。</p>
      <p>入力中の旅行計画も一緒に保存します。実際に訪れた場所や食べたものに直してから保存してください。</p>
      <div className="trip-fields">
        <label>訪問日<input type="date" value={values.visitDate} onChange={e => setValues({ ...values, visitDate: e.target.value })} /></label>
        {[["companions", "一緒に行った人"], ["foods", "食べたもの"], ["recommendedSpots", "おすすめスポット"], ["memory", "思い出メモ"]].map(([key, label]) => <label key={key}>{label}<textarea rows={3} value={values[key]} onChange={e => setValues({ ...values, [key]: e.target.value })} /></label>)}
      </div>
      <p>既存の訪問日がある場合はその日付を残し、今回の訪問日は思い出本文に記録します。</p>
      {error && <p className="trip-error" role="alert">{error}</p>}
      <div className="trip-ai-actions"><button className="trip-primary" disabled={blocked} type="submit">旅図帳に保存する</button><button type="button" onClick={onClose}>キャンセル</button></div>
    </form>
  </dialog>;
}
