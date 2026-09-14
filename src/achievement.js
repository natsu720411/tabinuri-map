export function getTravelAchievement(count) {
  const visitedCount = Math.max(0, Math.min(47, Number.isFinite(count) ? Math.floor(count) : 0));
  const title = visitedCount === 47 ? "47都道府県制覇！"
    : visitedCount >= 40 ? "全国制覇目前"
    : visitedCount >= 30 ? "全国制覇が見えてきた"
    : visitedCount >= 20 ? "日本をめぐる旅人"
    : visitedCount >= 10 ? "旅の探検家"
    : visitedCount >= 5 ? "旅好きビギナー"
    : visitedCount >= 1 ? "旅の一歩目" : "旅のはじまり";
  return { percent: Math.round(visitedCount / 47 * 100), title };
}