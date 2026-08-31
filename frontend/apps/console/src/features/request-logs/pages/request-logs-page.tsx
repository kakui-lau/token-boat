import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUpIcon, SearchIcon } from "lucide-react";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@token-boat/ui/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { DateRangePicker } from "@/components/date-range-picker";
import { DataPagination } from "@/components/data-pagination";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableIdentifier, TableText } from "@/components/table-value";
import type { RequestLogListInput } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatLatency, formatNumber, formatPreciseCurrency } from "@/lib/format";
import {
  dateRangeSearchPatch,
  type RequestLogSearch,
  resolveDateRange,
  type SearchPatch,
  useControllableSearch,
} from "@/lib/list-search";
import {
  RequestDetailsSheet,
  RequestStatusBadge,
  type RequestDetailsTab,
} from "../components/request-details-sheet";
import { RequestLogAnalyticsCard } from "../components/request-log-analytics-card";

type StatusFilter = Exclude<RequestLogListInput["status"], "processing">;

type RequestLogsPageProps = {
  onSearchChange?: (patch: SearchPatch<RequestLogSearch>) => void;
  search?: RequestLogSearch;
};

export function RequestLogsPage(props: RequestLogsPageProps) {
  const { t, i18n } = useTranslation();
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const range = useMemo(
    () => resolveDateRange(search, "7d"),
    [search.from, search.range, search.to],
  );
  const status: StatusFilter = search.status ?? "all";
  const searchField = search.field ?? "request";
  const keyword = search.q ?? "";
  const order = search.order ?? "desc";
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const query = useQuery({
    queryKey: ["request-logs", { keyword, order, page, pageSize, range, searchField, status }],
    queryFn: () =>
      repository.getRequestLogsPage({
        keyword,
        order,
        page,
        pageSize,
        range,
        searchField,
        status,
      }),
  });
  const analyticsQuery = useQuery({
    queryKey: ["request-log-analytics", { keyword, range, searchField, status }],
    queryFn: () =>
      repository.getRequestLogAnalytics({
        keyword,
        range,
        searchField,
        status,
      }),
  });
  const selectedRequestId = search.detail?.trim() || null;
  const detailQuery = useQuery({
    queryKey: ["request-log-detail", selectedRequestId],
    queryFn: () => repository.getRequestLog(selectedRequestId!),
    enabled: selectedRequestId !== null,
    retry: false,
  });
  const locale = i18n.resolvedLanguage ?? "zh";
  const logs = query.data?.items ?? [];
  const selectedTab: RequestDetailsTab = search.detailTab ?? "overview";
  let searchPlaceholder = t("Search request ID");
  if (searchField === "service_trace") searchPlaceholder = t("Search service trace ID");
  if (searchField === "model") searchPlaceholder = t("Search model name");
  if (searchField === "api_key") searchPlaceholder = t("Search API key name");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          <DateRangePicker
            onChange={(value) => {
              updateSearch({
                ...dateRangeSearchPatch(value, "7d"),
                detail: undefined,
                detailTab: undefined,
                page: undefined,
              });
            }}
            value={range}
          />
        }
        description={t("Trace every API call, inspect cost and latency, and diagnose failures.")}
        title={t("Request logs")}
      />

      <RequestLogAnalyticsCard
        data={analyticsQuery.data}
        error={analyticsQuery.isError}
        loading={analyticsQuery.isPending}
        onRetry={() => void analyticsQuery.refetch()}
        retrying={analyticsQuery.isFetching}
      />

      {query.isError ? (
        <DataLoadError
          description={t("Try refreshing the page or check the API connection.")}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
          title={t("Unable to load request logs")}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("Request explorer")}</CardTitle>
            <CardDescription>
              {t("Select a row to open the complete diagnostic context.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              className="grid gap-2 xl:grid-cols-[160px_minmax(0,1fr)_160px_180px_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                const nextKeyword = String(formData.get("q") ?? "").trim();
                updateSearch({
                  detail: undefined,
                  detailTab: undefined,
                  page: undefined,
                  q: nextKeyword || undefined,
                });
              }}
            >
              <Select
                onValueChange={(value) => {
                  if (!value) return;
                  const nextField = value as RequestLogListInput["searchField"];
                  updateSearch({
                    detail: undefined,
                    detailTab: undefined,
                    field: nextField === "request" ? undefined : nextField,
                    page: undefined,
                  });
                }}
                value={searchField}
              >
                <SelectTrigger aria-label={t("Search field")} className="w-full">
                  <SelectValue>{t(requestSearchFieldLabel(searchField))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="request">{t("Request ID")}</SelectItem>
                    <SelectItem value="service_trace">{t("Service trace ID")}</SelectItem>
                    <SelectItem value="model">{t("Model")}</SelectItem>
                    <SelectItem value="api_key">{t("API key")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  aria-label={t("Search request logs")}
                  defaultValue={keyword}
                  key={keyword}
                  name="q"
                  placeholder={searchPlaceholder}
                />
              </InputGroup>
              <Select
                value={status}
                onValueChange={(value) => {
                  if (!value) return;
                  const nextStatus = value as StatusFilter;
                  updateSearch({
                    detail: undefined,
                    detailTab: undefined,
                    page: undefined,
                    status: nextStatus === "all" ? undefined : nextStatus,
                  });
                }}
              >
                <SelectTrigger aria-label={t("Request status")} className="w-full">
                  <SelectValue>{t(requestStatusLabel(status))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">{t("All statuses")}</SelectItem>
                    <SelectItem value="succeeded">{t("Succeeded")}</SelectItem>
                    <SelectItem value="failed">{t("Failed")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) => {
                  if (!value) return;
                  const nextOrder = value as RequestLogListInput["order"];
                  updateSearch({
                    detail: undefined,
                    detailTab: undefined,
                    order: nextOrder === "desc" ? undefined : nextOrder,
                    page: undefined,
                  });
                }}
                value={order}
              >
                <SelectTrigger aria-label={t("Sort order")} className="w-full">
                  <ArrowDownUpIcon aria-hidden="true" />
                  <SelectValue>{t(order === "desc" ? "Newest first" : "Oldest first")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="desc">{t("Newest first")}</SelectItem>
                    <SelectItem value="asc">{t("Oldest first")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline">
                {t("Search")}
              </Button>
            </form>

            <div className="flex flex-col gap-4">
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Request ID")}</TableHead>
                      <TableHead>{t("Time")}</TableHead>
                      <TableHead>{t("Model")}</TableHead>
                      <TableHead>{t("Endpoint")}</TableHead>
                      <TableHead>{t("API key")}</TableHead>
                      <TableHead>{t("Source IP")}</TableHead>
                      <TableHead className="text-right">{t("Tokens")}</TableHead>
                      <TableHead className="text-right">{t("Latency")}</TableHead>
                      <TableHead className="text-right">{t("Cost")}</TableHead>
                      <TableHead className="text-right">{t("Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody aria-busy={query.isPending}>
                    {query.isPending ? <TableLoadingState colSpan={10} /> : null}
                    {!query.isPending && logs.length === 0 ? (
                      <TableEmptyState
                        colSpan={10}
                        description={t(
                          "Try another request ID, model, API key, status, or date range.",
                        )}
                        title={t("No matching requests")}
                      />
                    ) : null}
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Button
                            aria-label={log.id}
                            className="h-auto p-0 font-mono text-xs"
                            onClick={() =>
                              updateSearch({
                                detail: log.id,
                                detailTab: undefined,
                              })
                            }
                            variant="link"
                          >
                            <TableIdentifier value={log.id} />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <TableDateTime locale={locale} timestamp={log.createdAt} />
                        </TableCell>
                        <TableCell>
                          <TableText className="max-w-48 font-mono text-xs" value={log.model} />
                        </TableCell>
                        <TableCell>
                          <TableText
                            className="max-w-52 font-mono text-xs"
                            value={log.endpoint || "—"}
                          />
                        </TableCell>
                        <TableCell>
                          <TableText className="max-w-36" value={log.apiKeyName} />
                        </TableCell>
                        <TableCell>
                          <TableText
                            className="max-w-36 font-mono text-xs"
                            value={log.sourceIp ?? "—"}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(log.inputTokens + log.outputTokens, locale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLatency(log.latencyMs, locale)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPreciseCurrency(log.cost, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RequestStatusBadge status={log.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {query.isPending ? (
                <Skeleton className="h-8 w-full max-w-lg self-end" />
              ) : (
                <DataPagination
                  disabled={query.isFetching}
                  onPageChange={(value) =>
                    updateSearch({
                      detail: undefined,
                      detailTab: undefined,
                      page: value === 1 ? undefined : value,
                    })
                  }
                  onPageSizeChange={(value) => {
                    updateSearch({
                      detail: undefined,
                      detailTab: undefined,
                      page: undefined,
                      pageSize: value === 20 ? undefined : value,
                    });
                  }}
                  page={query.data?.page ?? page}
                  pageSize={query.data?.pageSize ?? pageSize}
                  total={query.data?.total ?? 0}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <RequestDetailsSheet
        error={detailQuery.isError}
        loading={detailQuery.isPending && selectedRequestId !== null}
        onOpenChange={(open) => {
          if (!open) updateSearch({ detail: undefined, detailTab: undefined });
        }}
        onRetry={() => void detailQuery.refetch()}
        onTabChange={(tab) => updateSearch({ detailTab: tab === "overview" ? undefined : tab })}
        request={detailQuery.data ?? null}
        requestId={selectedRequestId}
        tab={selectedTab}
      />
    </div>
  );
}

function requestStatusLabel(status: StatusFilter): string {
  const labels: Record<StatusFilter, string> = {
    all: "All statuses",
    succeeded: "Succeeded",
    failed: "Failed",
  };
  return labels[status];
}

function requestSearchFieldLabel(field: RequestLogListInput["searchField"]): string {
  if (field === "service_trace") return "Service trace ID";
  if (field === "model") return "Model";
  if (field === "api_key") return "API key";
  return "Request ID";
}
