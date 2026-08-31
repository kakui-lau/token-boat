import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@token-boat/ui/components/ui/chart";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import { ChartEmptyState } from "@/components/chart-empty-state";
import type { RequestLogAnalytics } from "@/data/contracts";
import { formatNumber, formatPreciseCurrency } from "@/lib/format";

type RequestMetric = "requests" | "rpm" | "tpm" | "tokens" | "cost" | "cache";

type RequestLogAnalyticsCardProps = {
  data: RequestLogAnalytics | undefined;
  error: boolean;
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
};

export function RequestLogAnalyticsCard(props: RequestLogAnalyticsCardProps) {
  const { t, i18n } = useTranslation();
  const [metric, setMetric] = useState<RequestMetric>("requests");
  const locale = i18n.resolvedLanguage ?? "zh";
  const data = props.data;
  const metrics = data
    ? [
        {
          label: t("Requests"),
          value: formatNumber(data.requestCount, locale),
        },
        {
          destructive: (data.failureRate ?? 0) > 0,
          label: t("Failure rate"),
          value: formatPercent(data.failureRate, locale),
        },
        { label: t("Peak RPM"), value: formatNumber(data.peakRpm, locale) },
        { label: t("Peak TPM"), value: formatNumber(data.peakTpm, locale) },
        { label: t("Tokens"), value: formatNumber(data.totalTokens, locale) },
        {
          label: t("Cost"),
          value: formatPreciseCurrency(data.totalCost, locale),
        },
        {
          label: t("Cache hit rate"),
          value: formatPercent(data.cacheHitRate, locale),
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{t("Request statistics")}</CardTitle>
          <CardDescription>{t("Usage and reliability for the selected filters.")}</CardDescription>
        </div>
        {props.loading ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
            {Array.from({ length: 7 }, (_, index) => (
              <div className="space-y-2" key={index}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
            {metrics.map((item) => (
              <div className="min-w-0" key={item.label}>
                <div className="truncate text-xs text-muted-foreground">{item.label}</div>
                <div
                  className={
                    item.destructive
                      ? "mt-1 truncate font-semibold tabular-nums text-destructive"
                      : "mt-1 truncate font-semibold tabular-nums"
                  }
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className="h-64 w-full" />
        ) : props.error ? (
          <ChartEmptyState
            action={
              <Button disabled={props.retrying} onClick={props.onRetry} size="sm" variant="outline">
                {t("Retry")}
              </Button>
            }
            className="min-h-64"
            description={t("Retry without changing the current filters.")}
            title={t("Unable to load request statistics")}
            variant="error"
          />
        ) : !data || data.requestCount === 0 ? (
          <ChartEmptyState
            className="min-h-64"
            description={t("Statistics appear after matching API requests are recorded.")}
            title={t("No matching request statistics")}
          />
        ) : (
          <Tabs onValueChange={(value) => setMetric(value as RequestMetric)} value={metric}>
            <TabsList
              aria-label={t("Request statistics metric")}
              className="max-w-full justify-start overflow-x-auto"
              variant="line"
            >
              <TabsTrigger value="requests">{t("Requests")}</TabsTrigger>
              <TabsTrigger value="rpm">RPM</TabsTrigger>
              <TabsTrigger value="tpm">TPM</TabsTrigger>
              <TabsTrigger value="tokens">{t("Tokens")}</TabsTrigger>
              <TabsTrigger value="cost">{t("Cost")}</TabsTrigger>
              <TabsTrigger value="cache">{t("Cache hit rate")}</TabsTrigger>
            </TabsList>
            <RequestMetricChart data={data} locale={locale} metric={metric} />
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function RequestMetricChart(props: {
  data: RequestLogAnalytics;
  locale: string;
  metric: RequestMetric;
}) {
  const { t } = useTranslation();
  const chartConfig = {
    succeeded: { color: "var(--chart-2)", label: t("Succeeded") },
    failed: { color: "var(--destructive)", label: t("Failed") },
    value: { color: "var(--chart-1)", label: t(metricLabel(props.metric)) },
  } satisfies ChartConfig;
  const chartData = props.data.series.map((point) => ({
    ...point,
    value:
      props.metric === "rpm"
        ? point.rpm
        : props.metric === "tpm"
          ? point.tpm
          : props.metric === "tokens"
            ? point.tokens
            : props.metric === "cost"
              ? point.cost
              : point.cacheHitRate,
  }));
  const bucketSeconds = props.data.series[0]?.bucketSeconds ?? 86_400;
  const formatValue = (value: number) => {
    if (props.metric === "cost") return formatPreciseCurrency(value, props.locale);
    if (props.metric === "cache") return formatPercent(value, props.locale);
    return formatNumber(value, props.locale, { maximumFractionDigits: 1 });
  };
  const axisLabel = (value: number) => formatBucketLabel(value, bucketSeconds, props.locale);

  if (props.metric === "requests") {
    return (
      <ChartContainer
        aria-label={t("Request count over time")}
        className="mt-4 h-64 w-full aspect-auto"
        config={chartConfig}
      >
        <BarChart accessibilityLayer data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="bucketStart"
            minTickGap={32}
            tickFormatter={axisLabel}
            tickLine={false}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={36} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatBucketDateTime(Number(value), props.locale)}
              />
            }
            cursor={{ fill: "var(--muted)", opacity: 0.45 }}
          />
          <Bar
            dataKey="succeeded"
            fill="var(--color-succeeded)"
            radius={[3, 3, 0, 0]}
            stackId="requests"
          />
          <Bar
            dataKey="failed"
            fill="var(--color-failed)"
            radius={[3, 3, 0, 0]}
            stackId="requests"
          />
        </BarChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer
      aria-label={t("{{metric}} over time", {
        metric: t(metricLabel(props.metric)),
      })}
      className="mt-4 h-64 w-full aspect-auto"
      config={chartConfig}
    >
      <AreaChart accessibilityLayer data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="bucketStart"
          minTickGap={32}
          tickFormatter={axisLabel}
          tickLine={false}
        />
        <YAxis
          axisLine={false}
          domain={props.metric === "cache" ? [0, 100] : undefined}
          tickFormatter={(value: number) =>
            props.metric === "cache"
              ? `${formatNumber(value, props.locale)}%`
              : formatNumber(value, props.locale, { notation: "compact" })
          }
          tickLine={false}
          width={50}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span className="font-mono font-medium tabular-nums">
                  {formatValue(Number(value))}
                </span>
              )}
              labelFormatter={(value) => formatBucketDateTime(Number(value), props.locale)}
            />
          }
        />
        <Area
          dataKey="value"
          fill="var(--color-value)"
          fillOpacity={0.16}
          stroke="var(--color-value)"
          strokeWidth={2}
          type="monotone"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function metricLabel(metric: RequestMetric): string {
  if (metric === "rpm") return "RPM";
  if (metric === "tpm") return "TPM";
  if (metric === "tokens") return "Tokens";
  if (metric === "cost") return "Cost";
  if (metric === "cache") return "Cache hit rate";
  return "Requests";
}

function formatPercent(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, locale, { maximumFractionDigits: 1 })}%`;
}

function formatBucketLabel(timestamp: number, bucketSeconds: number, locale: string): string {
  const options: Intl.DateTimeFormatOptions =
    bucketSeconds >= 86_400
      ? { month: "2-digit", day: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" };
  return new Intl.DateTimeFormat(locale, options).format(new Date(timestamp * 1_000));
}

function formatBucketDateTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1_000));
}
