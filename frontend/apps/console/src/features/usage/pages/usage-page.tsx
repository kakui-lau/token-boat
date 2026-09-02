import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  CircleCheckBigIcon,
  Clock3Icon,
  CoinsIcon,
  GaugeIcon,
  PlayIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@token-boat/ui/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { ChartEmptyState } from "@/components/chart-empty-state";
import { DataLoadError } from "@/components/data-load-error";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableIdentifier, TableText } from "@/components/table-value";
import type { DateRangePreset, DateRangeValue, UsageData } from "@/data/contracts";
import { repository } from "@/data/repository";
import { createDateRange, dateRangeDayCount } from "@/lib/date-range";
import { formatCurrency, formatLatency, formatNumber } from "@/lib/format";
import {
  dateRangeSearchPatch,
  resolveDateRange,
  type SearchPatch,
  type UsageSearch,
  useControllableSearch,
} from "@/lib/list-search";

type UsagePageProps = {
  onSearchChange?: (patch: SearchPatch<UsageSearch>) => void;
  search?: UsageSearch;
};

type ModelSortKey = "model" | "requests" | "tokens" | "cost" | "successRate";
type SortDirection = "ascending" | "descending";
type SpendBreakdownItem = { cost: number; id: string; label: string };

export function UsagePage(props: UsagePageProps) {
  const { t, i18n } = useTranslation();
  const [modelSort, setModelSort] = useState<{
    direction: SortDirection;
    key: ModelSortKey;
  }>({ direction: "descending", key: "tokens" });
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "3d"),
    [search.from, search.range, search.to],
  );
  const setRange = (value: DateRangeValue) => updateSearch(dateRangeSearchPatch(value, "3d"));
  const query = useQuery({ queryKey: ["usage", range], queryFn: () => repository.getUsage(range) });
  const locale = i18n.resolvedLanguage ?? "en";
  const modelCollator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: "base" }),
    [locale],
  );
  const sortedModels = useMemo(
    () =>
      [...(query.data?.models ?? [])].sort((left, right) => {
        if (modelSort.key === "successRate") {
          if (left.successRate === null) return right.successRate === null ? 0 : 1;
          if (right.successRate === null) return -1;
        }

        let comparison: number;
        if (modelSort.key === "model") {
          comparison = modelCollator.compare(left.model, right.model);
        } else {
          comparison = (left[modelSort.key] ?? 0) - (right[modelSort.key] ?? 0);
        }

        if (comparison === 0 && modelSort.key !== "model") {
          return modelCollator.compare(left.model, right.model);
        }
        return modelSort.direction === "ascending" ? comparison : -comparison;
      }),
    [modelCollator, modelSort.direction, modelSort.key, query.data?.models],
  );
  const changeModelSort = (key: ModelSortKey) => {
    setModelSort((current) => ({
      direction:
        current.key === key
          ? current.direction === "ascending"
            ? "descending"
            : "ascending"
          : key === "model"
            ? "ascending"
            : "descending",
      key,
    }));
  };
  const requestChartConfig = {
    requests: {
      color: "var(--chart-1)",
      label: t("Requests"),
    },
  } satisfies ChartConfig;
  const spendTrendConfig = {
    cost: {
      color: "var(--chart-2)",
      label: t("Spend"),
    },
  } satisfies ChartConfig;
  const apiKeySpendConfig = {
    cost: {
      color: "var(--chart-3)",
      label: t("Spend"),
    },
  } satisfies ChartConfig;
  const modelSpendConfig = {
    cost: {
      color: "var(--chart-4)",
      label: t("Spend"),
    },
  } satisfies ChartConfig;
  const apiKeySpend = useMemo(
    () =>
      limitSpendBreakdown(
        (query.data?.apiKeys ?? []).map((item) => ({
          cost: item.cost,
          id: `${item.apiKeyId}:${item.apiKeyName ?? ""}`,
          label: item.apiKeyName ?? t("API key not recorded"),
        })),
        t("Other API keys"),
      ),
    [query.data?.apiKeys, t],
  );
  const modelSpend = useMemo(
    () =>
      limitSpendBreakdown(
        (query.data?.models ?? []).map((item) => ({
          cost: item.cost,
          id: item.model,
          label: item.model,
        })),
        t("Other models"),
      ),
    [query.data?.models, t],
  );
  const metrics = query.data
    ? [
        {
          icon: ActivityIcon,
          label: t("Requests"),
          to: "/logs" as const,
          value: formatNumber(query.data.totalRequests, locale),
        },
        {
          icon: GaugeIcon,
          label: t("Tokens"),
          to: "/logs" as const,
          value: formatNumber(query.data.totalTokens, locale, { notation: "compact" }),
        },
        {
          icon: CoinsIcon,
          label: t("Cost"),
          to: "/billing" as const,
          value: formatCurrency(query.data.totalCost, locale),
        },
        {
          icon: Clock3Icon,
          label: t("Average latency"),
          to: "/logs" as const,
          value: formatLatency(query.data.averageLatencyMs, locale),
        },
        {
          icon: CircleCheckBigIcon,
          label: t("Success rate"),
          to: "/logs" as const,
          value:
            query.data.successRate === null
              ? "—"
              : `${formatNumber(query.data.successRate, locale, { maximumFractionDigits: 2 })}%`,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("Usage")}
        description={t("Analyze request volume, model usage, cost, and errors.")}
        action={<DateRangePicker onChange={setRange} value={range} />}
      />
      {query.isError ? (
        <DataLoadError
          description={t(
            "Usage metrics, charts, and tables could not be loaded. Retry with the same date range.",
          )}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load usage data")}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {query.isPending
              ? Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton className="h-28" key={index} />
                ))
              : metrics.map((metric) => <UsageMetricCard key={metric.label} metric={metric} />)}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Request volume")}</CardTitle>
                <CardDescription>
                  {t("Daily request count for the selected period.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RequestVolumeChart
                  config={requestChartConfig}
                  data={query.data}
                  loading={query.isPending}
                  locale={locale}
                  onChangeRange={setRange}
                  range={range}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("Spend trend")}</CardTitle>
                <CardDescription>{t("Daily spend for the selected period.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <SpendTrendChart
                  config={spendTrendConfig}
                  data={query.data}
                  loading={query.isPending}
                  locale={locale}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <SpendBreakdownCard
              chartLabel={t("Spend by API key chart")}
              config={apiKeySpendConfig}
              data={apiKeySpend}
              description={t("API keys ranked by spend in the selected period.")}
              loading={query.isPending}
              locale={locale}
              title={t("Spend by API key")}
              totalCost={query.data?.totalCost ?? 0}
            />
            <SpendBreakdownCard
              chartLabel={t("Spend by model chart")}
              config={modelSpendConfig}
              data={modelSpend}
              description={t("Models ranked by spend in the selected period.")}
              loading={query.isPending}
              locale={locale}
              title={t("Spend by model")}
              totalCost={query.data?.totalCost ?? 0}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("Usage by model")}</CardTitle>
              <CardDescription>
                {t("Requests, tokens, cost, and reliability by model.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table aria-label={t("Usage by model")}>
                <TableHeader>
                  <TableRow>
                    <SortableModelTableHead
                      column="model"
                      label={t("Model")}
                      onSort={changeModelSort}
                      sort={modelSort}
                    />
                    <SortableModelTableHead
                      align="right"
                      column="requests"
                      label={t("Requests")}
                      onSort={changeModelSort}
                      sort={modelSort}
                    />
                    <SortableModelTableHead
                      align="right"
                      column="tokens"
                      label={t("Tokens")}
                      onSort={changeModelSort}
                      sort={modelSort}
                    />
                    <SortableModelTableHead
                      align="right"
                      column="cost"
                      label={t("Cost")}
                      onSort={changeModelSort}
                      sort={modelSort}
                    />
                    <SortableModelTableHead
                      align="right"
                      column="successRate"
                      label={t("Success rate")}
                      onSort={changeModelSort}
                      sort={modelSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy={query.isPending}>
                  {query.isPending ? <TableLoadingState colSpan={5} /> : null}
                  {!query.isPending && (query.data?.models.length ?? 0) === 0 ? (
                    <TableEmptyState
                      colSpan={5}
                      description={t("Model-level usage is not available from the current API.")}
                      title={t("Model breakdown unavailable")}
                    />
                  ) : null}
                  {sortedModels.map((item) => (
                    <TableRow key={item.model}>
                      <TableCell>
                        <TableText className="max-w-64 font-mono text-xs" value={item.model} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(item.requests, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(item.tokens, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(item.cost, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {item.successRate === null ? "—" : `${item.successRate.toFixed(2)}%`}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Recent requests")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Request ID")}</TableHead>
                    <TableHead>{t("Model")}</TableHead>
                    <TableHead>{t("Time")}</TableHead>
                    <TableHead className="text-right">{t("Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy={query.isPending}>
                  {query.isPending ? <TableLoadingState colSpan={4} /> : null}
                  {!query.isPending && (query.data?.recentRequests.length ?? 0) === 0 ? (
                    <TableEmptyState
                      colSpan={4}
                      description={t("Requests in the selected date range will appear here.")}
                      title={t("No recent requests")}
                    />
                  ) : null}
                  {query.data?.recentRequests.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          aria-label={`${t("Request ID")}: ${item.id}`}
                          className="inline-flex underline-offset-4 hover:underline"
                          search={{
                            ...dateRangeSearchPatch(range, "today"),
                            detail: item.id,
                            field: "request",
                            q: item.id,
                          }}
                          to="/logs"
                        >
                          <TableIdentifier value={item.id} />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <TableText className="max-w-64 font-mono text-xs" value={item.model} />
                      </TableCell>
                      <TableCell>
                        <TableDateTime locale={locale} timestamp={item.createdAt} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
                          {t(activityStatusKey(item.status))}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SortableModelTableHead(props: {
  align?: "left" | "right";
  column: ModelSortKey;
  label: string;
  onSort(key: ModelSortKey): void;
  sort: { direction: SortDirection; key: ModelSortKey };
}) {
  const active = props.sort.key === props.column;
  const SortIcon = active
    ? props.sort.direction === "ascending"
      ? ArrowUpIcon
      : ArrowDownIcon
    : ArrowUpDownIcon;

  return (
    <TableHead
      aria-sort={active ? props.sort.direction : "none"}
      className={props.align === "right" ? "text-right" : undefined}
    >
      <button
        className={`inline-flex h-9 w-full cursor-pointer items-center gap-1 rounded-sm px-0 text-xs font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          props.align === "right" ? "justify-end" : "justify-start"
        }`}
        onClick={() => props.onSort(props.column)}
        type="button"
      >
        {props.label}
        <SortIcon
          aria-hidden="true"
          className={active ? "size-3.5 text-foreground" : "size-3.5 text-muted-foreground"}
        />
      </button>
    </TableHead>
  );
}

function limitSpendBreakdown(
  items: SpendBreakdownItem[],
  otherLabel: string,
): SpendBreakdownItem[] {
  const sorted = items
    .filter((item) => item.cost > 0)
    .sort((left, right) => right.cost - left.cost || left.label.localeCompare(right.label));
  if (sorted.length <= 8) return sorted;

  return [
    ...sorted.slice(0, 7),
    {
      cost: sorted.slice(7).reduce((total, item) => total + item.cost, 0),
      id: "other",
      label: otherLabel,
    },
  ];
}

function SpendBreakdownCard(props: {
  chartLabel: string;
  config: ChartConfig;
  data: SpendBreakdownItem[];
  description: string;
  loading: boolean;
  locale: string;
  title: string;
  totalCost: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <SpendBreakdownChart {...props} />
      </CardContent>
    </Card>
  );
}

function SpendBreakdownChart(props: {
  chartLabel: string;
  config: ChartConfig;
  data: SpendBreakdownItem[];
  loading: boolean;
  locale: string;
  totalCost: number;
}) {
  const { t } = useTranslation();

  if (props.loading) return <Skeleton className="h-64 w-full" />;

  if (props.totalCost <= 0) {
    return (
      <ChartEmptyState
        description={t("Spend appears after billable API requests are settled.")}
        title={t("No spend in this period")}
      />
    );
  }

  if (props.data.length === 0) {
    return (
      <ChartEmptyState
        description={t("Settled spend exists, but this breakdown is not available.")}
        title={t("Spend breakdown unavailable")}
      />
    );
  }

  return (
    <ChartContainer
      aria-label={props.chartLabel}
      className="h-64 w-full aspect-auto"
      config={props.config}
    >
      <BarChart
        accessibilityLayer
        data={props.data}
        layout="vertical"
        margin={{ left: 4, right: 16 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis axisLine={false} dataKey="cost" hide tickLine={false} type="number" />
        <YAxis
          axisLine={false}
          dataKey="label"
          tickFormatter={(value: string) => (value.length > 18 ? `${value.slice(0, 17)}…` : value)}
          tickLine={false}
          type="category"
          width={124}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex min-w-44 flex-1 items-center justify-between gap-4">
                  <span className="max-w-40 truncate text-muted-foreground">
                    {String(item.payload.label)}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(Number(value), props.locale)}
                  </span>
                </div>
              )}
              hideLabel
            />
          }
          cursor={{ fill: "var(--muted)", opacity: 0.45 }}
        />
        <Bar dataKey="cost" fill="var(--color-cost)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}

function UsageMetricCard(props: {
  metric: {
    icon: typeof ActivityIcon;
    label: string;
    to: "/billing" | "/logs";
    value: string;
  };
}) {
  const Icon = props.metric.icon;

  return (
    <Link
      aria-label={`${props.metric.label}: ${props.metric.value}`}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      to={props.metric.to}
    >
      <Card className="h-full transition-colors hover:ring-primary/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardDescription>{props.metric.label}</CardDescription>
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl tabular-nums">{props.metric.value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function SpendTrendChart(props: {
  config: ChartConfig;
  data: UsageData | undefined;
  loading: boolean;
  locale: string;
}) {
  const { t } = useTranslation();

  if (props.loading) return <Skeleton className="h-64 w-full" />;

  if (!props.data || props.data.totalCost <= 0) {
    return (
      <ChartEmptyState
        description={t("Spend appears after billable API requests are settled.")}
        title={t("No spend in this period")}
      />
    );
  }

  if (!props.data.series.some((point) => point.cost > 0)) {
    return (
      <ChartEmptyState
        description={t("Settled spend exists, but the API did not return a daily spend breakdown.")}
        title={t("Spend trend unavailable")}
      />
    );
  }

  return (
    <ChartContainer
      aria-label={t("Spend trend chart")}
      className="h-64 w-full aspect-auto"
      config={props.config}
    >
      <AreaChart accessibilityLayer data={props.data.series} margin={{ left: 12, right: 12 }}>
        <defs>
          <linearGradient id="fillSpend" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-cost)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-cost)" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={24}
          tickFormatter={(value: string) =>
            new Intl.DateTimeFormat(props.locale, { month: "short", day: "numeric" }).format(
              new Date(`${value}T00:00:00`),
            )
          }
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="flex min-w-36 flex-1 items-center justify-between gap-4">
                  <span className="text-muted-foreground">{t("Spend")}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(Number(value), props.locale)}
                  </span>
                </div>
              )}
              indicator="line"
              labelFormatter={(_, payload) => {
                const date = payload[0]?.payload?.date;
                return typeof date === "string"
                  ? new Intl.DateTimeFormat(props.locale, { dateStyle: "medium" }).format(
                      new Date(`${date}T00:00:00`),
                    )
                  : "";
              }}
            />
          }
          cursor={false}
        />
        <Area
          dataKey="cost"
          fill="url(#fillSpend)"
          fillOpacity={0.4}
          stroke="var(--color-cost)"
          type="natural"
        />
      </AreaChart>
    </ChartContainer>
  );
}

type RequestVolumeChartProps = {
  config: ChartConfig;
  data: UsageData | undefined;
  loading: boolean;
  locale: string;
  onChangeRange(value: DateRangeValue): void;
  range: DateRangeValue;
};

function RequestVolumeChart(props: RequestVolumeChartProps) {
  const { t } = useTranslation();

  if (props.loading) return <Skeleton className="h-64 w-full" />;

  if (!props.data || props.data.totalRequests === 0) {
    const broaderPreset = broaderDateRangePreset(props.range);
    return (
      <ChartEmptyState
        action={
          <>
            {broaderPreset ? (
              <Button onClick={() => props.onChangeRange(createDateRange(broaderPreset))}>
                {t(broaderPreset === "30d" ? "View last 30 days" : "View last 90 days")}
              </Button>
            ) : null}
            <Button nativeButton={false} render={<Link to="/playground" />} variant="outline">
              <PlayIcon data-icon="inline-start" />
              {t("Open Playground")}
            </Button>
          </>
        }
        description={t(
          "There are no API requests to chart for the selected date range. Choose a wider range or send a test request.",
        )}
        title={t("No requests in this period")}
      />
    );
  }

  if (!props.data.series.some((point) => point.requests > 0)) {
    return (
      <ChartEmptyState
        action={
          <Button nativeButton={false} render={<Link to="/logs" />} variant="outline">
            {t("View request logs")}
          </Button>
        }
        description={t(
          "Summary totals are available, but the API does not provide a daily breakdown for this period.",
        )}
        title={t("Daily trend is not available yet")}
      />
    );
  }

  return (
    <ChartContainer
      aria-label={t("Request volume chart")}
      className="h-64 w-full aspect-auto"
      config={props.config}
    >
      <AreaChart accessibilityLayer data={props.data.series} margin={{ left: 12, right: 12 }}>
        <defs>
          <linearGradient id="fillRequests" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor="var(--color-requests)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-requests)" stopOpacity={0.08} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="date"
          minTickGap={24}
          tickFormatter={(value: string) =>
            new Intl.DateTimeFormat(props.locale, { month: "short", day: "numeric" }).format(
              new Date(`${value}T00:00:00`),
            )
          }
          tickLine={false}
          tickMargin={8}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(_, payload) => {
                const date = payload[0]?.payload?.date;
                return typeof date === "string"
                  ? new Intl.DateTimeFormat(props.locale, { dateStyle: "medium" }).format(
                      new Date(`${date}T00:00:00`),
                    )
                  : "";
              }}
            />
          }
          cursor={false}
        />
        <Area
          dataKey="requests"
          fill="url(#fillRequests)"
          fillOpacity={0.4}
          stroke="var(--color-requests)"
          type="natural"
        />
      </AreaChart>
    </ChartContainer>
  );
}

function broaderDateRangePreset(
  range: DateRangeValue,
): Extract<DateRangePreset, "30d" | "90d"> | null {
  const days = dateRangeDayCount(range);
  if (days < 30) return "30d";
  if (days < 90) return "90d";
  return null;
}

function activityStatusKey(status: UsageData["recentRequests"][number]["status"]) {
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  return "Succeeded";
}
