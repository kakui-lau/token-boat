import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      "rankings.activity": "Activity over time",
      "rankings.activityDescription": "Aggregate token volume in each reporting bucket.",
      "rankings.allModels": "Full model leaderboard",
      "rankings.change": "Change",
      "rankings.empty": "No aggregate usage is available for this period yet.",
      "rankings.error": "The public rankings could not be loaded.",
      "rankings.growth": "volume",
      "rankings.live": "Anonymous aggregate usage",
      "rankings.loading": "Loading rankings",
      "rankings.model": "Model",
      "rankings.models": "models",
      "rankings.month": "30 days",
      "rankings.movers": "Climbing",
      "rankings.new": "New",
      "rankings.period": "Ranking period",
      "rankings.providerShare": "Provider share",
      "rankings.rank": "Rank",
      "rankings.retry": "Try again",
      "rankings.share": "Share",
      "rankings.topModel": "Top model",
      "rankings.topModels": "Most used models",
      "rankings.today": "Today",
      "rankings.tokens": "tokens",
      "rankings.week": "7 days",
      "rankings.year": "365 days",
      "rankings.droppers": "Cooling",
      "rankings.disclaimer":
        "Rankings use anonymous aggregate token volume. They show relative platform usage, not benchmark quality, availability, safety, or a recommendation.",
    },
  },
  zh: {
    translation: {
      "rankings.activity": "用量变化",
      "rankings.activityDescription": "各统计时间桶内的匿名聚合 Token 用量。",
      "rankings.allModels": "完整模型榜单",
      "rankings.change": "变化",
      "rankings.empty": "当前周期暂时没有可公开的聚合用量。",
      "rankings.error": "暂时无法加载公开排行榜。",
      "rankings.growth": "用量",
      "rankings.live": "匿名聚合用量",
      "rankings.loading": "正在加载排行榜",
      "rankings.model": "模型",
      "rankings.models": "个模型",
      "rankings.month": "近 30 天",
      "rankings.movers": "热度上升",
      "rankings.new": "新上榜",
      "rankings.period": "排行周期",
      "rankings.providerShare": "供应商份额",
      "rankings.rank": "排名",
      "rankings.retry": "重新加载",
      "rankings.share": "份额",
      "rankings.topModel": "热门模型",
      "rankings.topModels": "最常用模型",
      "rankings.today": "今日",
      "rankings.tokens": "Token",
      "rankings.week": "近 7 天",
      "rankings.year": "近 365 天",
      "rankings.droppers": "热度回落",
      "rankings.disclaimer":
        "排行榜依据匿名聚合 Token 用量生成，只反映平台内的相对使用热度，不代表基准测试质量、可用性、安全性或官方推荐。",
    },
  },
} as const;

export function createRankingsI18n(locale: "en" | "zh"): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    fallbackLng: "zh",
    initAsync: false,
    interpolation: { escapeValue: false },
    lng: locale,
    resources,
  });
  return instance;
}
