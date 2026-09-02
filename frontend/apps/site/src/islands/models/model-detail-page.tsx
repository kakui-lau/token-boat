import { useEffect, useMemo, useState } from "react";
import {
  parsePublicPricingEnvelope,
  type PublicPriceComponent,
  type PublicPricingModel,
} from "@/islands/pricing/public-pricing";

type Props = { locale: "en" | "zh"; modelId: string };
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
  | { status: "ready"; model: PublicPricingModel; performance: Performance | null };

export function ModelDetailPageIsland({ locale, modelId }: Props) {
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
            pricing: "公开计费组件",
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
            account: "登录确认账户价格",
            docs: "查看接入文档",
            component: "组件",
            price: "价格",
            unit: "单位",
            conditions: "条件",
            unknown: "尚未核验/公开",
          }
        : {
            loading: "Loading model details and 24-hour aggregates…",
            error: "Model details are temporarily unavailable.",
            missing: "This model is not currently listed in the public catalog.",
            provider: "Provider",
            family: "Capability type",
            context: "Context",
            output: "Max output",
            endpoints: "Compatible endpoints",
            capabilities: "Capability tags",
            pricing: "Public price components",
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
            account: "Sign in to confirm account pricing",
            docs: "Read integration docs",
            component: "Component",
            price: "Price",
            unit: "Unit",
            conditions: "Conditions",
            unknown: "Not yet verified/published",
          },
    [locale],
  );

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/pricing", { credentials: "same-origin", signal: controller.signal }),
      fetch("/api/perf-metrics/summary?hours=24", {
        credentials: "same-origin",
        signal: controller.signal,
      }),
    ])
      .then(async ([pricingResponse, perfResponse]) => {
        if (!pricingResponse.ok) throw new Error("pricing unavailable");
        const pricingPayload = (await pricingResponse.json()) as unknown;
        const models = parsePublicPricingEnvelope(pricingPayload);
        const model = models.find((item) => item.id === modelId);
        if (!model) {
          setState({ status: "missing" });
          return;
        }
        const perfPayload = perfResponse.ok ? ((await perfResponse.json()) as unknown) : null;
        setState({ model, performance: parsePerformance(perfPayload, modelId), status: "ready" });
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
  const { model, performance } = state;
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
          <p>{model.description ?? c.unknown}</p>
          <div className="model-page-actions">
            <a className="button" href="/console/sign-in">
              {c.account}
              <span aria-hidden="true">↗</span>
            </a>
            <a href={locale === "en" ? "/en/docs" : "/docs"}>{c.docs} →</a>
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
              model.tags.map((tag) => <li key={tag}>{tag}</li>)
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
          <p>PUBLIC PRICE BOOK</p>
          <h2>{c.pricing}</h2>
        </header>
        {model.priceComponents.length ? (
          <div className="model-price-table">
            <div className="model-price-table__head">
              <span>{c.component}</span>
              <span>{c.price}</span>
              <span>{c.unit}</span>
              <span>{c.conditions}</span>
            </div>
            {model.priceComponents.map((item, index) => (
              <PriceRow item={item} key={`${item.component}-${index}`} locale={locale} />
            ))}
          </div>
        ) : (
          <p>{c.unknown}</p>
        )}
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

function PriceRow({ item, locale }: { item: PublicPriceComponent; locale: "en" | "zh" }) {
  const conditions =
    [
      item.tier,
      item.operation,
      item.quality,
      item.resolution,
      item.withAudio,
      item.upperBound ? `≤ ${item.upperBound}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "—";
  return (
    <div className="model-price-table__row">
      <strong>{item.component}</strong>
      <span>
        {new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
          style: "currency",
          currency: item.currency,
          maximumFractionDigits: 6,
        }).format(item.amount)}
      </span>
      <span>
        {item.unitSize
          ? `${new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(item.unitSize)} ${item.unit}`
          : item.unit}
      </span>
      <span>{conditions}</span>
    </div>
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
function formatNumber(value: number | null, locale: "en" | "zh", fallback: string) {
  return value && value > 0
    ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value)
    : fallback;
}
function formatDuration(value: number, locale: "en" | "zh") {
  return `${new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 0 }).format(value)} ms`;
}
function formatPercent(value: number, locale: "en" | "zh") {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
}
function formatDecimal(value: number, locale: "en" | "zh") {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}
function formatTimestamp(value: number, locale: "en" | "zh") {
  const ms = value < 10_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(ms));
}
