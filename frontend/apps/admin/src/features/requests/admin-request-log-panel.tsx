import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUpIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { adminRepository } from "@/repository/admin-repository";
import type {
  AdminRequestListInput,
  AdminRequestLog,
  AdminRequestSearchField,
  AdminRequestStatusFilter,
  AdminRequestWorkspace,
  AdminTimeRange,
} from "@/repository/contracts";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { Input } from "@token-boat/ui/components/ui/input";
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
import {
  formatAdminCurrency,
  formatAdminDateTime,
  formatAdminLatency,
  formatAdminNumber,
} from "./admin-operation-format";
import { AdminRequestDetailSheet, RequestStatusBadge } from "./admin-request-detail-sheet";
import { refreshAdminTimeRange } from "./admin-time-range";

const pageSize = 20;
const searchFields: AdminRequestSearchField[] = [
  "request",
  "service_trace",
  "username",
  "model",
  "api_key",
];
const statuses: AdminRequestStatusFilter[] = ["all", "succeeded", "failed"];
const orders = ["desc", "asc"] as const;

export function AdminRequestLogPanel({
  onRangeChange,
  range,
}: {
  onRangeChange(value: AdminTimeRange): void;
  range: AdminTimeRange;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "zh";
  const [draftKeyword, setDraftKeyword] = useState("");
  const [keyword, setKeyword] = useState("");
  const [order, setOrder] = useState<(typeof orders)[number]>("desc");
  const [page, setPage] = useState(1);
  const [searchField, setSearchField] = useState<AdminRequestSearchField>("request");
  const [selectedRequest, setSelectedRequest] = useState<AdminRequestLog | null>(null);
  const [status, setStatus] = useState<AdminRequestStatusFilter>("all");

  useEffect(() => {
    setPage(1);
    setSelectedRequest(null);
  }, [range.endTimestamp, range.startTimestamp]);

  const queryInput = useMemo<AdminRequestListInput>(
    () => ({ keyword, order, page, pageSize, range, searchField, status }),
    [keyword, order, page, range, searchField, status],
  );
  const query = useQuery<AdminRequestWorkspace>({
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) => adminRepository.getRequestWorkspace(queryInput, signal),
    queryKey: [
      "admin-request-workspace",
      {
        keyword,
        order,
        page,
        pageSize,
        searchField,
        status,
        timeRange: [range.startTimestamp, range.endTimestamp],
      },
    ],
  });
  const items = query.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / pageSize));
  const refreshWorkspace = () => {
    const nextRange = refreshAdminTimeRange(range);
    if (
      nextRange.startTimestamp === range.startTimestamp &&
      nextRange.endTimestamp === range.endTimestamp
    ) {
      void query.refetch();
      return;
    }
    onRangeChange(nextRange);
  };

  return (
    <div className="flex flex-col gap-4">
      {query.data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            description={t("requests.summary.requestsDescription")}
            title={t("requests.summary.requests")}
            value={formatAdminNumber(query.data.summary.requestCount, locale)}
          />
          <SummaryCard
            description={t("requests.summary.failuresDescription", {
              count: formatAdminNumber(query.data.summary.failedCount, locale),
            })}
            title={t("requests.summary.failureRate")}
            value={
              query.data.summary.failureRate === null
                ? "—"
                : new Intl.NumberFormat(locale, {
                    style: "percent",
                    maximumFractionDigits: 1,
                  }).format(query.data.summary.failureRate)
            }
          />
          <SummaryCard
            description={t("requests.summary.peak", {
              rpm: formatAdminNumber(query.data.summary.peakRpm, locale),
              tpm: formatAdminNumber(query.data.summary.peakTpm, locale),
            })}
            title={t("requests.summary.tokens")}
            value={formatAdminNumber(query.data.summary.totalTokens, locale)}
          />
          <SummaryCard
            description={t("requests.summary.costDescription")}
            title={t("requests.summary.cost")}
            value={formatAdminCurrency(query.data.summary.costUsd, locale)}
          />
        </div>
      )}

      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>{t("requests.loadFailed")}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("requests.loadFailedDescription")}</span>
            <Button onClick={refreshWorkspace} size="sm" variant="outline">
              <RefreshCwIcon data-icon="inline-start" />
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!query.data && query.isError ? null : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("requests.explorer")}</CardTitle>
              <CardDescription>{t("requests.explorerDescription")}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form
              className="grid gap-2 xl:grid-cols-[10rem_minmax(14rem,1fr)_10rem_10rem_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setKeyword(draftKeyword.trim());
                setPage(1);
              }}
            >
              <Select
                items={searchFields.map((value) => ({ label: t(searchFieldKey(value)), value }))}
                onValueChange={(value) => {
                  if (!value) return;
                  setKeyword(draftKeyword.trim());
                  setSearchField(value as AdminRequestSearchField);
                  setPage(1);
                }}
                value={searchField}
              >
                <SelectTrigger aria-label={t("requests.searchField")} className="w-full">
                  <SelectValue>{t(searchFieldKey(searchField))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {searchFields.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(searchFieldKey(value))}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                aria-label={t("requests.search")}
                name="query"
                onChange={(event) => setDraftKeyword(event.target.value)}
                placeholder={t("requests.searchPlaceholder")}
                value={draftKeyword}
              />
              <Select
                items={statuses.map((value) => ({ label: t(statusKey(value)), value }))}
                onValueChange={(value) => {
                  if (!value) return;
                  setKeyword(draftKeyword.trim());
                  setStatus(value as AdminRequestStatusFilter);
                  setPage(1);
                }}
                value={status}
              >
                <SelectTrigger aria-label={t("requests.statusFilter")} className="w-full">
                  <SelectValue>{t(statusKey(status))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(statusKey(value))}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                items={orders.map((value) => ({ label: t(`requests.order.${value}`), value }))}
                onValueChange={(value) => {
                  if (!value) return;
                  setKeyword(draftKeyword.trim());
                  setOrder(value as (typeof orders)[number]);
                  setPage(1);
                }}
                value={order}
              >
                <SelectTrigger aria-label={t("requests.order.label")} className="w-full">
                  <ArrowDownUpIcon />
                  <SelectValue>{t(`requests.order.${order}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {orders.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`requests.order.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button type="submit">
                  <SearchIcon data-icon="inline-start" />
                  {t("common.search")}
                </Button>
                <Button
                  aria-label={t("common.refresh")}
                  disabled={query.isFetching}
                  onClick={refreshWorkspace}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <RefreshCwIcon className={query.isFetching ? "animate-spin" : undefined} />
                </Button>
              </div>
            </form>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("requests.time")}</TableHead>
                    <TableHead>{t("requests.status")}</TableHead>
                    <TableHead>{t("requests.request")}</TableHead>
                    <TableHead>{t("requests.customer")}</TableHead>
                    <TableHead>{t("requests.model")}</TableHead>
                    <TableHead>{t("requests.channel")}</TableHead>
                    <TableHead className="text-right">{t("requests.tokens")}</TableHead>
                    <TableHead className="text-right">{t("requests.latency")}</TableHead>
                    <TableHead className="text-right">{t("requests.cost")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.isPending
                    ? Array.from({ length: 7 }, (_, index) => (
                        <TableRow key={index}>
                          <TableCell colSpan={9}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : items.map((request) => (
                        <TableRow key={`${request.id}-${request.requestId}`}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {formatAdminDateTime(request.createdAt, locale, range.timeZone)}
                          </TableCell>
                          <TableCell>
                            <RequestStatusBadge status={request.status} />
                          </TableCell>
                          <TableCell>
                            <div className="max-w-48">
                              <Button
                                className="h-auto max-w-full justify-start p-0 font-mono text-xs"
                                onClick={() => setSelectedRequest(request)}
                                title={request.requestId}
                                variant="link"
                              >
                                <span className="truncate">{request.requestId}</span>
                              </Button>
                              <div
                                className="truncate text-xs text-muted-foreground"
                                title={request.endpoint ?? undefined}
                              >
                                {request.endpoint ?? "—"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-36">
                              <div className="truncate text-sm">{request.username}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {request.apiKeyName ?? "—"}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-44 truncate font-mono text-xs">
                              {request.model ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-32 truncate text-xs">
                              {request.channelName ??
                                (request.channelId ? `#${request.channelId}` : "—")}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatAdminNumber(request.inputTokens + request.outputTokens, locale)}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatAdminLatency(request.latencyMs, locale)}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {formatAdminCurrency(request.costUsd, locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
              {!query.isPending && items.length === 0 && (
                <Empty className="border-0 py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchIcon />
                    </EmptyMedia>
                    <EmptyTitle>{t("requests.emptyTitle")}</EmptyTitle>
                    <EmptyDescription>{t("requests.emptyDescription")}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                {t("requests.pageSummary", {
                  page: query.data?.page ?? page,
                  pages: totalPages,
                  total: query.data?.total ?? 0,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  size="sm"
                  variant="outline"
                >
                  {t("common.previous")}
                </Button>
                <Button
                  disabled={page >= totalPages || query.isFetching}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  size="sm"
                  variant="outline"
                >
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AdminRequestDetailSheet
        onOpenChange={(open) => {
          if (!open) setSelectedRequest(null);
        }}
        request={selectedRequest}
        timeZone={range.timeZone}
      />
    </div>
  );
}

function SummaryCard(props: { description: string; title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardDescription>{props.title}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{props.value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{props.description}</CardContent>
    </Card>
  );
}

function searchFieldKey(field: AdminRequestSearchField): string {
  return `requests.searchField.${field}`;
}

function statusKey(status: AdminRequestStatusFilter): string {
  return `requests.status.${status}`;
}
