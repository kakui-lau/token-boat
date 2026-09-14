import { useEffect, useMemo, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { createPricingI18n } from "@/i18n/pricing";
import { localizedPath, siteLocaleMeta, type SiteLocale } from "@/content/site-copy";
import { PriceBreakdown } from "@/islands/pricing/price-breakdown";
import { type PublicPricingModel } from "@/islands/pricing/public-pricing";
import { fetchViewerPricing, type ViewerPricingAudience } from "@/islands/pricing/viewer-pricing";

type Props = { locale: SiteLocale; modelId: string };
type Performance = {
  avgLatencyMs: number;
  avgTps: number;
  requestCount: number;
  successRate: number;
};
type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "missing" }
  | {
      audience: ViewerPricingAudience;
      status: "ready";
      model: PublicPricingModel;
      officialModel: PublicPricingModel | null;
      performance: Performance | null;
    };

const secondaryLocaleCopy = {
  ja: {
    loading: "モデル情報と24時間集計を読み込み中…",
    error: "モデル情報を一時的に取得できません。",
    missing: "このモデルは現在、公開カタログにありません。",
    provider: "プロバイダー",
    family: "機能タイプ",
    context: "コンテキスト",
    output: "最大出力",
    endpoints: "互換エンドポイント",
    capabilities: "機能タグ",
    priceDetails: "料金詳細",
    publicPricing: "公式料金項目",
    accountPricing: "現在のアカウント料金項目",
    degradedPricing:
      "アカウント料金を確認できないため、公式料金を表示しています。コンソールを開くか、後でもう一度確認してください。",
    source: "制限情報の公式ソース",
    verified: "確認日",
    performance: "過去24時間の匿名集計パフォーマンス",
    latency: "平均遅延",
    success: "成功率",
    tps: "平均 TPS",
    samples: "サンプルリクエスト",
    noPerf: "過去24時間に公開できる十分な集計サンプルがありません。",
    methodology:
      "集計方法：過去24時間のプラットフォーム集計。遅延は平均リクエスト遅延、成功率は成功リクエストの割合、サンプルはリクエスト数です。値はトラフィックで変動し、SLA やタスク間の品質順位を示しません。",
    account: "コンソールでアカウント料金を確認",
    signIn: "ログインしてアカウント料金を確認",
    docs: "導入ドキュメント",
    component: "項目",
    price: "料金",
    unit: "単位",
    conditions: "条件",
    unknown: "未確認または未公開",
  },
  ko: {
    loading: "모델 정보 및 24시간 집계 불러오는 중…",
    error: "모델 정보를 일시적으로 불러올 수 없습니다.",
    missing: "이 모델은 현재 공개 카탈로그에 없습니다.",
    provider: "공급자",
    family: "기능 유형",
    context: "컨텍스트",
    output: "최대 출력",
    endpoints: "호환 엔드포인트",
    capabilities: "기능 태그",
    priceDetails: "가격 상세",
    publicPricing: "공식 가격 항목",
    accountPricing: "현재 계정 가격 항목",
    degradedPricing:
      "계정 가격을 확인할 수 없어 공식 가격을 표시합니다. 콘솔을 열거나 나중에 다시 확인하세요.",
    source: "제한 정보 공식 출처",
    verified: "확인일",
    performance: "최근 24시간 익명 집계 성능",
    latency: "평균 지연",
    success: "성공률",
    tps: "평균 TPS",
    samples: "샘플 요청",
    noPerf: "최근 24시간에 공개할 수 있는 집계 샘플이 충분하지 않습니다.",
    methodology:
      "집계 방식: 최근 24시간 플랫폼 집계입니다. 지연은 평균 요청 지연, 성공률은 성공 요청 비율, 샘플은 요청 수입니다. 값은 트래픽에 따라 변하며 SLA나 작업 간 품질 순위가 아닙니다.",
    account: "콘솔에서 계정 가격 확인",
    signIn: "로그인하여 계정 가격 확인",
    docs: "연동 문서 보기",
    component: "항목",
    price: "가격",
    unit: "단위",
    conditions: "조건",
    unknown: "확인 또는 공개되지 않음",
  },
  "zh-TW": {
    loading: "正在讀取模型資料與 24 小時彙總指標…",
    error: "暫時無法讀取模型資料。",
    missing: "此模型目前不在公開目錄中。",
    provider: "供應商",
    family: "能力類型",
    context: "上下文",
    output: "最大輸出",
    endpoints: "相容端點",
    capabilities: "能力標籤",
    priceDetails: "價格明細",
    publicPricing: "官方計費項目",
    accountPricing: "目前帳戶計費項目",
    degradedPricing: "暫時無法確認目前帳戶價格，以下顯示官方價格。請開啟控制台或稍後再試。",
    source: "限制資料官方來源",
    verified: "驗證時間",
    performance: "近 24 小時匿名彙總效能",
    latency: "平均延遲",
    success: "成功率",
    tps: "平均 TPS",
    samples: "樣本請求",
    noPerf: "近 24 小時沒有足夠的公開彙總樣本。",
    methodology:
      "統計方式：過去 24 小時的平台彙總記錄；延遲為平均請求延遲，成功率為成功請求占比，樣本量為請求數。資料會隨流量變動，不代表 SLA，也不作為跨任務品質排名。",
    account: "在控制台查看帳戶價格",
    signIn: "登入查看帳戶價格",
    docs: "查看串接文件",
    component: "項目",
    price: "價格",
    unit: "單位",
    conditions: "條件",
    unknown: "尚未驗證或公開",
  },
} as const;

export function ModelDetailPageIsland(props: Props) {
  const i18n = useMemo(() => createPricingI18n(props.locale), [props.locale]);
  return (
    <I18nextProvider i18n={i18n}>
      <ModelDetailPageContent locale={props.locale} modelId={props.modelId} />
    </I18nextProvider>
  );
}

function ModelDetailPageContent({ locale, modelId }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const c = useMemo(
    () =>
      locale === "zh"
        ? {
            loading: "正在读取模型资料与 24 小时聚合指标…",
            error: "暂时无法读取模型资料。",
            missing: "该模型目前不在公开目录中。",
            provider: "供应商",
            family: "能力类型",
            context: "上下文",
            output: "最大输出",
            endpoints: "兼容端点",
            capabilities: "能力标签",
            priceDetails: "价格明细",
            publicPricing: "官方计费组件",
            accountPricing: "当前账户计费组件",
            degradedPricing:
              "暂时无法确认当前账户价格，以下展示官方价格。请打开控制台或稍后重试以确认账户价。",
            source: "限制资料官方来源",
            verified: "核验时间",
            performance: "近 24 小时匿名聚合性能",
            latency: "平均延迟",
            success: "成功率",
            tps: "平均 TPS",
            samples: "样本请求",
            noPerf: "近 24 小时没有足够的公开聚合样本。",
            methodology:
              "统计口径：过去 24 小时内平台聚合记录；延迟为请求平均延迟，成功率为聚合成功请求占比，样本量为请求数。数据会随流量变化，不代表 SLA，也不用于跨任务质量排名。",
            account: "在控制台查看账户价格",
            signIn: "登录查看账户价格",
            docs: "查看接入文档",
            component: "组件",
            price: "价格",
            unit: "单位",
            conditions: "条件",
            unknown: "尚未核验/公开",
          }
        : locale === "en"
          ? {
              loading: "Loading model details and 24-hour aggregates…",
              error: "Model details are temporarily unavailable.",
              missing: "This model is not currently listed in the public catalog.",
              provider: "Provider",
              family: "Capability type",
              context: "Context",
              output: "Max output",
              endpoints: "Compatible endpoints",
              capabilities: "Capability tags",
              priceDetails: "Price details",
              publicPricing: "Official price components",
              accountPricing: "Current account price components",
              degradedPricing:
                "Account pricing could not be confirmed, so official prices are shown. Open the console or retry to confirm your account price.",
              source: "Official source for limits",
              verified: "Verified",
              performance: "Anonymous 24-hour performance aggregates",
              latency: "Average latency",
              success: "Success rate",
              tps: "Average TPS",
              samples: "Request sample",
              noPerf: "There are not enough public aggregate samples in the past 24 hours.",
              methodology:
                "Method: platform aggregates from the past 24 hours. Latency is the average request latency, success is the aggregate successful-request share, and sample is the request count. Values change with traffic, are not an SLA, and do not rank output quality across tasks.",
              account: "Review account pricing in the console",
              signIn: "Sign in to view account pricing",
              docs: "Read integration docs",
              component: "Component",
              price: "Price",
              unit: "Unit",
              conditions: "Conditions",
              unknown: "Not yet verified/published",
            }
          : secondaryLocaleCopy[locale],
    [locale],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchViewerPricing(controller.signal),
      fetch("/api/perf-metrics/summary?hours=24", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      }),
    ])
      .then(async ([catalog, perfResponse]) => {
        const model = catalog.models.find((item) => item.id === modelId);
        if (!model) {
          setState({ status: "missing" });
          return;
        }
        const perfPayload = perfResponse.ok ? ((await perfResponse.json()) as unknown) : null;
        setState({
          audience: catalog.audience,
          model,
          officialModel:
            catalog.officialModels.find((item) => item.id === modelId) ??
            (model.priceAudience === "official" ? model : null),
          performance: parsePerformance(perfPayload, modelId),
          status: "ready",
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, [modelId]);

  if (state.status !== "ready")
    return (
      <section
        className="model-page-state motion-surface-enter"
        aria-live="polite"
        role={state.status === "error" ? "alert" : undefined}
      >
        <p>
          {state.status === "loading"
            ? c.loading
            : state.status === "missing"
              ? c.missing
              : c.error}
        </p>
      </section>
    );
  const { audience, model, officialModel, performance } = state;
  const canOpenAccountConsole = audience !== "official";
  return (
    <>
      <section className="model-page-overview motion-surface-enter">
        <div className="model-page-facts">
          <dl>
            <div>
              <dt>{c.provider}</dt>
              <dd>{model.provider ?? "—"}</dd>
            </div>
            <div>
              <dt>{c.family}</dt>
              <dd>{model.family}</dd>
            </div>
            <div>
              <dt>{c.context}</dt>
              <dd>{formatNumber(model.contextLength, locale, c.unknown)}</dd>
            </div>
            <div>
              <dt>{c.output}</dt>
              <dd>{formatNumber(model.maxOutputTokens, locale, c.unknown)}</dd>
            </div>
          </dl>
          <p>{localizedModelDescription(model, locale, c.unknown)}</p>
          <div className="model-page-actions">
            <a
              className="button"
              href={canOpenAccountConsole ? "/console/models" : "/console/sign-in"}
            >
              {canOpenAccountConsole ? c.account : c.signIn}
              <span aria-hidden="true">↗</span>
            </a>
            <a href={localizedPath(locale, "/docs")}>{c.docs} →</a>
          </div>
        </div>
        <aside className="model-limit-source">
          <p>{c.source}</p>
          {model.limitsSourceUrl ? (
            <a href={model.limitsSourceUrl} rel="noreferrer" target="_blank">
              {new URL(model.limitsSourceUrl).hostname}
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <strong>{c.unknown}</strong>
          )}
          <span>
            {c.verified}:{" "}
            {model.limitsVerifiedAt ? formatTimestamp(model.limitsVerifiedAt, locale) : c.unknown}
          </span>
        </aside>
      </section>
      <section className="model-page-section">
        <header>
          <p>CAPABILITIES / ENDPOINTS</p>
          <h2>{c.capabilities}</h2>
        </header>
        <div className="model-page-two-column">
          <ul className="model-tags model-tags--detail">
            {model.tags.length ? (
              model.tags.map((tag) => <li key={tag}>{localizedModelTag(tag, locale)}</li>)
            ) : (
              <li>{c.unknown}</li>
            )}
          </ul>
          <div>
            <h3>{c.endpoints}</h3>
            <ul className="endpoint-list">
              {model.endpoints.length ? (
                model.endpoints.map((endpoint) => <li key={endpoint}>{endpoint}</li>)
              ) : (
                <li>{c.unknown}</li>
              )}
            </ul>
          </div>
        </div>
      </section>
      <section className="model-page-section">
        <header>
          <p>PRICE DETAILS</p>
          <h2>{c.priceDetails}</h2>
        </header>
        {audience === "degraded" ? (
          <p className="model-page-pricing-note" role="status">
            {c.degradedPricing}
          </p>
        ) : null}
        <PriceBreakdown
          key={model.id}
          locale={locale}
          model={model}
          officialModel={officialModel}
        />
      </section>
      <section className="model-page-section model-performance">
        <header>
          <p>LIVE AGGREGATES / 24H</p>
          <h2>{c.performance}</h2>
        </header>
        {performance ? (
          <dl>
            <div>
              <dt>{c.latency}</dt>
              <dd>{formatDuration(performance.avgLatencyMs, locale)}</dd>
            </div>
            <div>
              <dt>{c.success}</dt>
              <dd>{formatPercent(performance.successRate, locale)}</dd>
            </div>
            <div>
              <dt>{c.tps}</dt>
              <dd>{formatDecimal(performance.avgTps, locale)}</dd>
            </div>
            <div>
              <dt>{c.samples}</dt>
              <dd>{formatNumber(performance.requestCount, locale, "—")}</dd>
            </div>
          </dl>
        ) : (
          <p>{c.noPerf}</p>
        )}
        <small>{c.methodology}</small>
      </section>
    </>
  );
}

function parsePerformance(value: unknown, modelId: string): Performance | null {
  if (!value || typeof value !== "object") return null;
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;
  const models = (data as Record<string, unknown>).models;
  if (!Array.isArray(models)) return null;
  const raw = models.find(
    (item) =>
      item && typeof item === "object" && (item as Record<string, unknown>).model_name === modelId,
  ) as Record<string, unknown> | undefined;
  if (!raw) return null;
  const values = [raw.avg_latency_ms, raw.avg_tps, raw.request_count, raw.success_rate].map(
    (item) => (typeof item === "number" && Number.isFinite(item) ? item : null),
  );
  if (values.some((item) => item === null)) return null;
  return {
    avgLatencyMs: values[0]!,
    avgTps: values[1]!,
    requestCount: values[2]!,
    successRate: values[3]!,
  };
}
function formatNumber(value: number | null, locale: SiteLocale, fallback: string) {
  return value && value > 0
    ? new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale).format(value)
    : fallback;
}
function formatDuration(value: number, locale: SiteLocale) {
  return `${new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, { maximumFractionDigits: 0 }).format(value)} ms`;
}
function formatPercent(value: number, locale: SiteLocale) {
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
}
function formatDecimal(value: number, locale: SiteLocale) {
  return new Intl.NumberFormat(siteLocaleMeta[locale].numberLocale, {
    maximumFractionDigits: 2,
  }).format(value);
}
function formatTimestamp(value: number, locale: SiteLocale) {
  const ms = value < 10_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat(siteLocaleMeta[locale].numberLocale, {
    dateStyle: "medium",
  }).format(new Date(ms));
}

function localizedModelDescription(
  model: PublicPricingModel,
  locale: SiteLocale,
  fallback: string,
): string {
  if (locale === "zh") return model.description ?? fallback;
  if (locale === "en" && model.description && !/[\u3400-\u9fff]/u.test(model.description)) {
    return model.description;
  }
  const provider = model.provider ?? "—";
  if (locale === "ja")
    return `${provider} が提供する ${model.family} モデルです。公開されている機能、制限、エンドポイント、料金項目を以下で確認できます。`;
  if (locale === "ko")
    return `${provider}에서 제공하는 ${model.family} 모델입니다. 아래에서 공개 기능, 제한, 엔드포인트 및 과금 항목을 확인할 수 있습니다.`;
  if (locale === "zh-TW")
    return `${provider} 提供的 ${model.family} 模型。你可以在下方查看公開能力、限制、端點與計費項目。`;
  return `A ${model.family} model from ${provider}. Review its published capabilities, limits, endpoints, and price components below.`;
}

function localizedModelTag(tag: string, locale: SiteLocale): string {
  if (locale === "zh") return tag;
  const translations: Record<Exclude<SiteLocale, "zh">, Record<string, string>> = {
    en: {
      代码: "Coding",
      多模态: "Multimodal",
      对话: "Chat",
      工具: "Tool use",
      图片: "Image",
      图像: "Image",
      嵌入: "Embeddings",
      推理: "Reasoning",
      文本: "Text",
      生成: "Generation",
      视频: "Video",
      视频生成: "Video generation",
      语音: "Speech",
      音频: "Audio",
    },
    ja: {
      代码: "コード",
      多模态: "マルチモーダル",
      对话: "チャット",
      工具: "ツール利用",
      图片: "画像",
      图像: "画像",
      嵌入: "埋め込み",
      推理: "推論",
      文本: "テキスト",
      生成: "生成",
      视频: "動画",
      视频生成: "動画生成",
      语音: "音声",
      音频: "オーディオ",
    },
    ko: {
      代码: "코드",
      多模态: "멀티모달",
      对话: "채팅",
      工具: "도구 사용",
      图片: "이미지",
      图像: "이미지",
      嵌入: "임베딩",
      推理: "추론",
      文本: "텍스트",
      生成: "생성",
      视频: "비디오",
      视频生成: "비디오 생성",
      语音: "음성",
      音频: "오디오",
    },
    "zh-TW": {
      代码: "程式碼",
      多模态: "多模態",
      对话: "對話",
      工具: "工具",
      图片: "圖片",
      图像: "圖像",
      嵌入: "嵌入",
      推理: "推理",
      文本: "文字",
      生成: "生成",
      视频: "影片",
      视频生成: "影片生成",
      语音: "語音",
      音频: "音訊",
    },
  };
  return translations[locale][tag] ?? tag;
}
