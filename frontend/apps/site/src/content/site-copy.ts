export type SiteLocale = "en" | "zh";

type SiteCopy = {
  signal: {
    lead: string;
    trail: string;
  };
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
};

export const siteCopy: Record<SiteLocale, SiteCopy> = {
  zh: {
    signal: {
      lead: "统一 AI API",
      trail: "模型 · 价格 · 用量",
    },
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
  },
  en: {
    signal: {
      lead: "UNIFIED AI API",
      trail: "MODELS · PRICING · USAGE",
    },
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
  },
};

export function localizedPath(locale: SiteLocale, path: string): string {
  const normalizedPath = path === "/" ? "" : path;
  if (locale === "en") return `/en${normalizedPath || "/"}`;
  return normalizedPath || "/";
}
