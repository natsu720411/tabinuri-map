import { getTravelAchievement } from "./achievement.js";
export const SHARE_URL = "https://tabinuri-map.vercel.app/";

export function createShareText(count, total = 47) {
  const message = count === 0
    ? "これから日本全国を旅して、\n旅図帳で思い出を記録していきます！"
    : count === total
      ? `${total}都道府県制覇しました！\n旅の思い出を日本地図に残しています。`
      : `${total}都道府県中${count}県を訪問しました！\n全国制覇まであと${total - count}県。\n旅の思い出を日本地図に残しています。`;
  const { percent, title } = getTravelAchievement(count);
  return `${message}\n達成率 ${percent}%｜称号：${title}\n\n#旅図帳 #旅行記録 #日本地図`;
}
