export const siteLocales = ["zh", "en", "ja", "ko", "zh-TW"] as const;

export type SiteLocale = (typeof siteLocales)[number];
export type BaseContentLocale = "en" | "zh";

type SiteLocaleMeta = {
  htmlLanguage: string;
  hreflang: string;
  label: string;
  numberLocale: string;
};

export const siteLocaleMeta: Record<SiteLocale, SiteLocaleMeta> = {
  zh: { htmlLanguage: "zh-CN", hreflang: "zh-CN", label: "简体中文", numberLocale: "zh-CN" },
  en: { htmlLanguage: "en", hreflang: "en", label: "English", numberLocale: "en-US" },
  ja: { htmlLanguage: "ja", hreflang: "ja", label: "日本語", numberLocale: "ja-JP" },
  ko: { htmlLanguage: "ko", hreflang: "ko", label: "한국어", numberLocale: "ko-KR" },
  "zh-TW": { htmlLanguage: "zh-TW", hreflang: "zh-TW", label: "繁體中文", numberLocale: "zh-TW" },
};

type SiteCopy = {
  signal: { lead: string; trail: string };
  nav: {
    home: string;
    models: string;
    rankings: string;
    docs: string;
    status: string;
    about: string;
    signIn: string;
    getStarted: string;
    menu: string;
    faq: string;
    changelog: string;
    support: string;
    trust: string;
  };
  footer: {
    description: string;
    product: string;
    company: string;
    legal: string;
    terms: string;
    privacy: string;
    rights: string;
  };
  accessibility: {
    language: string;
    primaryNavigation: string;
    skipToContent: string;
  };
};

export const siteCopy: Record<SiteLocale, SiteCopy> = {
  zh: {
    signal: { lead: "统一 AI API", trail: "模型 · 价格 · 用量" },
    nav: {
      home: "首页",
      models: "模型与价格",
      rankings: "排行榜",
      docs: "文档",
      status: "状态",
      about: "关于",
      signIn: "登录",
      getStarted: "开始接入",
      menu: "打开导航",
      faq: "常见问题",
      changelog: "更新日志",
      support: "支持中心",
      trust: "安全与信任",
    },
    footer: {
      description: "用一套 API 接入所需模型，清楚掌握价格、用量与每一次请求。",
      product: "产品",
      company: "公司",
      legal: "法律",
      terms: "服务条款",
      privacy: "隐私政策",
      rights: "保留所有权利。",
    },
    accessibility: {
      language: "切换语言",
      primaryNavigation: "主导航",
      skipToContent: "跳到主要内容",
    },
  },
  en: {
    signal: { lead: "UNIFIED AI API", trail: "MODELS · PRICING · USAGE" },
    nav: {
      home: "Home",
      models: "Models & pricing",
      rankings: "Rankings",
      docs: "Docs",
      status: "Status",
      about: "About",
      signIn: "Sign in",
      getStarted: "Get started",
      menu: "Open navigation",
      faq: "FAQ",
      changelog: "Changelog",
      support: "Support",
      trust: "Security & trust",
    },
    footer: {
      description:
        "One API for the models you need, with clear pricing, usage, and request records.",
      product: "Product",
      company: "Company",
      legal: "Legal",
      terms: "Terms of service",
      privacy: "Privacy policy",
      rights: "All rights reserved.",
    },
    accessibility: {
      language: "Change language",
      primaryNavigation: "Primary navigation",
      skipToContent: "Skip to content",
    },
  },
  ja: {
    signal: { lead: "統合 AI API", trail: "モデル · 料金 · 使用量" },
    nav: {
      home: "ホーム",
      models: "モデルと料金",
      rankings: "ランキング",
      docs: "ドキュメント",
      status: "稼働状況",
      about: "概要",
      signIn: "ログイン",
      getStarted: "利用を開始",
      menu: "ナビゲーションを開く",
      faq: "よくある質問",
      changelog: "更新履歴",
      support: "サポート",
      trust: "セキュリティと信頼",
    },
    footer: {
      description:
        "1つの API で必要なモデルに接続し、料金、使用量、各リクエストを明確に把握できます。",
      product: "製品",
      company: "会社",
      legal: "法務",
      terms: "利用規約",
      privacy: "プライバシーポリシー",
      rights: "無断転載を禁じます。",
    },
    accessibility: {
      language: "言語を変更",
      primaryNavigation: "メインナビゲーション",
      skipToContent: "本文へ移動",
    },
  },
  ko: {
    signal: { lead: "통합 AI API", trail: "모델 · 가격 · 사용량" },
    nav: {
      home: "홈",
      models: "모델 및 가격",
      rankings: "순위",
      docs: "문서",
      status: "상태",
      about: "소개",
      signIn: "로그인",
      getStarted: "시작하기",
      menu: "탐색 메뉴 열기",
      faq: "자주 묻는 질문",
      changelog: "업데이트 내역",
      support: "지원",
      trust: "보안 및 신뢰",
    },
    footer: {
      description:
        "하나의 API로 필요한 모델을 연결하고 가격, 사용량, 각 요청을 명확하게 확인하세요.",
      product: "제품",
      company: "회사",
      legal: "법률",
      terms: "서비스 약관",
      privacy: "개인정보 처리방침",
      rights: "모든 권리 보유.",
    },
    accessibility: {
      language: "언어 변경",
      primaryNavigation: "주 탐색",
      skipToContent: "본문으로 이동",
    },
  },
  "zh-TW": {
    signal: { lead: "統一 AI API", trail: "模型 · 價格 · 用量" },
    nav: {
      home: "首頁",
      models: "模型與價格",
      rankings: "排行榜",
      docs: "文件",
      status: "狀態",
      about: "關於",
      signIn: "登入",
      getStarted: "開始串接",
      menu: "開啟導覽",
      faq: "常見問題",
      changelog: "更新日誌",
      support: "支援中心",
      trust: "安全與信任",
    },
    footer: {
      description: "用一套 API 串接所需模型，清楚掌握價格、用量與每一次請求。",
      product: "產品",
      company: "公司",
      legal: "法律",
      terms: "服務條款",
      privacy: "隱私權政策",
      rights: "保留所有權利。",
    },
    accessibility: {
      language: "切換語言",
      primaryNavigation: "主導覽",
      skipToContent: "跳至主要內容",
    },
  },
};

export function contentLocale(locale: SiteLocale): BaseContentLocale {
  return locale === "zh" || locale === "zh-TW" ? "zh" : "en";
}

export function localizedPath(locale: SiteLocale, path: string): string {
  const normalizedPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  if (locale === "zh") return normalizedPath || "/";
  return `/${locale}${normalizedPath || "/"}`;
}

export function stripLocalePrefix(path: string): string {
  const withoutPrefix = path.replace(/^\/(?:en|ja|ko|zh-TW)(?=\/|$)/, "");
  return withoutPrefix || "/";
}
