export function getShareTopThree(records, prefectures) {
  return prefectures.filter(({ id }) => {
    const r = records[id];
    return r?.visited === true && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5;
  }).sort((a, b) => {
    const l = records[a.id], r = records[b.id];
    return r.rating - l.rating || Number(r.favorite === true) - Number(l.favorite === true)
      || (r.visitDate || "").localeCompare(l.visitDate || "") || a.id - b.id;
  }).slice(0, 3).map(({ id, name }) => ({ id, name, rating: records[id].rating }));
}
