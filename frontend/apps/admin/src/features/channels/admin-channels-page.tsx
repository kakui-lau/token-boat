import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIcon,
  FlaskConicalIcon,
  GaugeIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  ServerIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAdminPermission } from "@/app/admin-session-context";
import { adminRepository } from "@/repository/admin-repository";
import type { AdminChannel, ChannelStatus, ChannelStatusFilter } from "@/repository/contracts";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
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

const pageSize = 20;

const channelTypeLabels: Record<number, string> = {
  1: "OpenAI",
  3: "Azure",
  4: "Ollama",
  14: "Anthropic",
  17: "Alibaba Cloud",
  20: "OpenRouter",
  24: "Gemini",
  25: "Moonshot",
  33: "AWS",
  39: "Cloudflare",
  40: "SiliconFlow",
  41: "Vertex AI",
  42: "Mistral",
  43: "DeepSeek",
  45: "VolcEngine",
  48: "xAI",
  50: "Kling",
  54: "Doubao Video",
  55: "Sora",
  56: "Replicate",
  57: "ChatGPT Subscription",
  58: "Advanced Custom",
  59: "Sub2API",
  60: "New API",
  61: "Anitix",
};

export function AdminChannelsPage() {
  const { i18n, t } = useTranslation();
  const canOperateChannels = useAdminPermission("channel", "operate");
  const queryClient = useQueryClient();
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ChannelStatusFilter>("all");
  const queryInput = { keyword, page, pageSize, status };
  const channelsQuery = useQuery({
    queryKey: ["admin-channels", queryInput],
    queryFn: ({ signal }) => adminRepository.listChannels(queryInput, signal),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 1 | 2 }) =>
      adminRepository.setChannelStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-channels"] }),
  });
  const testMutation = useMutation({
    mutationFn: async (channel: AdminChannel) => ({
      channel,
      result: await adminRepository.testChannel(channel.id),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-channels"] }),
  });

  const data = channelsQuery.data;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));
  const pageEnabled = data?.items.filter((channel) => channel.status === 1).length ?? 0;
  const testedChannels = data?.items.filter((channel) => channel.testTime > 0).length ?? 0;
  const averageLatency = averageResponseTime(data?.items ?? []);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <Badge className="mb-3" variant="secondary">
            {t("scope.platform")}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {t("channels.title")}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
            {t("workspace.channels.description")}
          </p>
        </div>
        <Button
          disabled={channelsQuery.isFetching}
          onClick={() => void channelsQuery.refetch()}
          variant="outline"
        >
          <RefreshCwIcon data-icon="inline-start" />
          {t("common.refresh")}
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description={t("channels.totalDescription")}
          icon={ServerIcon}
          loading={channelsQuery.isPending}
          title={t("channels.total")}
          value={data?.total.toLocaleString(i18n.resolvedLanguage) ?? "0"}
        />
        <MetricCard
          description={t("channels.visibleDescription")}
          icon={ActivityIcon}
          loading={channelsQuery.isPending}
          title={t("channels.enabledVisible")}
          value={`${pageEnabled}/${data?.items.length ?? 0}`}
        />
        <MetricCard
          description={t("channels.latencyDescription")}
          icon={GaugeIcon}
          loading={channelsQuery.isPending}
          title={t("channels.averageLatency")}
          value={averageLatency === null ? "—" : `${Math.round(averageLatency)} ms`}
        />
        <MetricCard
          description={t("channels.testedDescription")}
          icon={FlaskConicalIcon}
          loading={channelsQuery.isPending}
          title={t("channels.testedVisible")}
          value={`${testedChannels}/${data?.items.length ?? 0}`}
        />
      </div>

      {(channelsQuery.isError || statusMutation.isError || testMutation.isError) && (
        <Alert variant="destructive">
          <AlertTitle>{t("channels.operationFailed")}</AlertTitle>
          <AlertDescription>
            {errorMessage(channelsQuery.error ?? statusMutation.error ?? testMutation.error)}
          </AlertDescription>
        </Alert>
      )}

      {testMutation.isSuccess && (
        <Alert>
          <ActivityIcon aria-hidden="true" />
          <AlertTitle>{t("channels.testSucceeded")}</AlertTitle>
          <AlertDescription>
            {t("channels.testResult", {
              name: testMutation.data.channel.name,
              seconds: testMutation.data.result.durationSeconds.toFixed(2),
            })}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{t("channels.inventory")}</CardTitle>
          <CardDescription>{t("channels.inventoryDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setKeyword(keywordInput.trim());
            }}
          >
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("channels.search")}
                className="pl-8"
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={t("channels.searchPlaceholder")}
                value={keywordInput}
              />
            </div>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                setPage(1);
                setStatus(value as ChannelStatusFilter);
              }}
              value={status}
            >
              <SelectTrigger aria-label={t("channels.statusFilter")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("channels.allStatuses")}</SelectItem>
                  <SelectItem value="enabled">{t("channels.enabled")}</SelectItem>
                  <SelectItem value="disabled">{t("channels.disabled")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="submit">{t("common.search")}</Button>
          </form>

          {channelsQuery.isPending ? (
            <div className="flex flex-col gap-2" aria-label={t("common.loading")}>
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton className="h-12 w-full" key={index} />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("channels.channel")}</TableHead>
                    <TableHead>{t("channels.routing")}</TableHead>
                    <TableHead>{t("channels.status")}</TableHead>
                    <TableHead>{t("channels.health")}</TableHead>
                    <TableHead>{t("channels.balance")}</TableHead>
                    {canOperateChannels ? (
                      <TableHead className="text-right">{t("channels.actions")}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((channel) => (
                    <TableRow key={channel.id}>
                      <TableCell className="max-w-72 whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{channel.name}</span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            #{channel.id} · {channelTypeLabel(channel.type)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span>{channel.group}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("channels.modelCount", { count: channel.modelCount })}
                            {channel.tag ? ` · ${channel.tag}` : ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChannelStatusBadge status={channel.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="tabular-nums">
                            {channel.responseTimeMs > 0 ? `${channel.responseTimeMs} ms` : "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTestTime(channel.testTime, i18n.resolvedLanguage)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatUsd(channel.balanceUsd, i18n.resolvedLanguage)}
                      </TableCell>
                      {canOperateChannels ? (
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              disabled={testMutation.isPending}
                              onClick={() => testMutation.mutate(channel)}
                              size="sm"
                              variant="outline"
                            >
                              {testMutation.isPending &&
                              testMutation.variables?.id === channel.id ? (
                                <LoaderCircleIcon
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <ActivityIcon data-icon="inline-start" />
                              )}
                              {t("channels.test")}
                            </Button>
                            <Button
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: channel.id,
                                  status: channel.status === 1 ? 2 : 1,
                                })
                              }
                              size="sm"
                              variant={channel.status === 1 ? "ghost" : "default"}
                            >
                              {channel.status === 1 ? t("channels.disable") : t("channels.enable")}
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {t("channels.pageSummary", {
                    page,
                    pages: totalPages,
                    total: data.total,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    size="sm"
                    variant="outline"
                  >
                    {t("common.previous")}
                  </Button>
                  <Button
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    size="sm"
                    variant="outline"
                  >
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ServerIcon />
                </EmptyMedia>
                <EmptyTitle>{t("channels.emptyTitle")}</EmptyTitle>
                <EmptyDescription>{t("channels.emptyDescription")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard(props: {
  description: string;
  icon: typeof ServerIcon;
  loading: boolean;
  title: string;
  value: string;
}) {
  const Icon = props.icon;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
        <CardAction>
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {props.loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelStatusBadge({ status }: { status: ChannelStatus }) {
  const { t } = useTranslation();
  if (status === 1) return <Badge>{t("channels.enabled")}</Badge>;
  if (status === 2) return <Badge variant="secondary">{t("channels.manuallyDisabled")}</Badge>;
  if (status === 3) return <Badge variant="destructive">{t("channels.autoDisabled")}</Badge>;
  return <Badge variant="outline">{t("channels.unknown")}</Badge>;
}

function averageResponseTime(channels: AdminChannel[]): number | null {
  let count = 0;
  let total = 0;
  for (const channel of channels) {
    if (channel.responseTimeMs <= 0) continue;
    count += 1;
    total += channel.responseTimeMs;
  }
  return count === 0 ? null : total / count;
}

function channelTypeLabel(type: number): string {
  return channelTypeLabels[type] ?? `Type ${type}`;
}

function formatTestTime(value: number, locale?: string): string {
  if (value <= 0) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value * 1_000));
}

function formatUsd(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
