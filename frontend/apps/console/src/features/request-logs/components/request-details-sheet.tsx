import { Fragment, type ReactNode } from "react";
import type { TFunction } from "i18next";
import {
  ActivityIcon,
  BracesIcon,
  ClockIcon,
  CoinsIcon,
  CopyIcon,
  GaugeIcon,
  NetworkIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
import { Separator } from "@token-boat/ui/components/ui/separator";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import type { RequestLogRecord } from "@/data/contracts";
import { copyText } from "@/lib/clipboard";
import { formatDateTime, formatLatency, formatNumber, formatPreciseCurrency } from "@/lib/format";

type RequestDetailsSheetProps = {
  request: RequestLogRecord | null;
  requestId: string | null;
  loading: boolean;
  error: boolean;
  onOpenChange(open: boolean): void;
  onRetry(): void;
  onTabChange(tab: RequestDetailsTab): void;
  tab: RequestDetailsTab;
};

export type RequestDetailsTab = "overview" | "usage" | "diagnostics";

type DetailRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

export function RequestDetailsSheet(props: RequestDetailsSheetProps) {
  const { t, i18n } = useTranslation();
  const request = props.request;
  const locale = i18n.resolvedLanguage ?? "zh";
  const throughput =
    request?.latencyMs && request.latencyMs > 0 && request.outputTokens > 0
      ? request.outputTokens / (request.latencyMs / 1_000)
      : null;
  const throughputLabel =
    throughput === null
      ? "—"
      : t("{{count}} tokens/s", {
          count: formatNumber(throughput, locale, { maximumFractionDigits: 1 }),
        });
  const totalTokens = request ? request.inputTokens + request.outputTokens : 0;

  const copyValue = async (value: string, message: string) => {
    try {
      await copyText(value);
      toast.success(message);
    } catch {
      toast.error(t("Unable to copy value"));
    }
  };

  return (
    <Sheet open={props.requestId !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl"
        showCloseButton={false}
        side="right"
      >
        <SheetClose
          render={
            <Button
              aria-label={t("Close")}
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>{t("Request details")}</SheetTitle>
            {request && <RequestStatusBadge status={request.status} />}
          </div>
          <SheetDescription>
            {t("Inspect trace identifiers, performance, usage, billing, and service diagnostics.")}
          </SheetDescription>
          {(request || props.requestId) && (
            <div className="flex min-w-0 items-center gap-2 pt-1">
              <code
                className="min-w-0 flex-1 truncate text-xs"
                title={request?.id ?? props.requestId ?? undefined}
              >
                {request?.id ?? props.requestId}
              </code>
              {request && (
                <Button
                  aria-label={t("Copy request ID")}
                  onClick={() => void copyValue(request.id, t("Request ID copied"))}
                  size="icon-xs"
                  variant="ghost"
                >
                  <CopyIcon />
                </Button>
              )}
            </div>
          )}
        </SheetHeader>

        {props.loading && (
          <div aria-label={t("Loading request details")} className="grid gap-4 p-4" role="status">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {props.error && !props.loading && (
          <div className="flex flex-col gap-4 p-4">
            <Alert variant="destructive">
              <AlertTitle>{t("Request details unavailable")}</AlertTitle>
              <AlertDescription>
                {t(
                  "The request could not be loaded from this account. Check the request ID or retry the connection.",
                )}
              </AlertDescription>
            </Alert>
            <Button className="self-start" onClick={props.onRetry} variant="outline">
              {t("Try again")}
            </Button>
          </div>
        )}

        {request && (
          <Tabs
            className="min-h-0 flex-1 gap-0"
            onValueChange={(value) => props.onTabChange(value as RequestDetailsTab)}
            value={props.tab}
          >
            <div className="border-b px-4 py-2">
              <TabsList className="max-w-full overflow-x-auto" variant="line">
                <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
                <TabsTrigger value="usage">{t("Usage and billing")}</TabsTrigger>
                <TabsTrigger value="diagnostics">{t("Diagnostics")}</TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <TabsContent className="flex flex-col gap-4 p-4" value="overview">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ObservationMetric
                    icon={<ActivityIcon aria-hidden="true" />}
                    label={t("Status")}
                    value={<RequestStatusBadge status={request.status} />}
                  />
                  <ObservationMetric
                    icon={<ClockIcon aria-hidden="true" />}
                    label={t("Latency")}
                    value={formatLatency(request.latencyMs, locale)}
                  />
                  <ObservationMetric
                    icon={<GaugeIcon aria-hidden="true" />}
                    label={t("First token latency")}
                    value={formatLatency(request.firstTokenLatencyMs ?? null, locale)}
                  />
                  <ObservationMetric
                    icon={<NetworkIcon aria-hidden="true" />}
                    label={t("Output throughput")}
                    value={throughputLabel}
                  />
                </div>

                {request.errorMessage && (
                  <Alert variant="destructive">
                    <AlertTitle>{request.errorCode ?? t("Request failed")}</AlertTitle>
                    <AlertDescription>{request.errorMessage}</AlertDescription>
                  </Alert>
                )}

                <DetailSection icon={<NetworkIcon aria-hidden="true" />} title={t("Trace context")}>
                  <DetailList
                    rows={[
                      {
                        label: t("Request ID"),
                        value: <CopyableValue value={request.id} onCopy={copyValue} />,
                        mono: true,
                      },
                      ...(request.serviceTraceId
                        ? [
                            {
                              label: t("Service trace ID"),
                              value: (
                                <CopyableValue value={request.serviceTraceId} onCopy={copyValue} />
                              ),
                              mono: true,
                            },
                          ]
                        : []),
                      {
                        label: t("Source IP"),
                        value: request.sourceIp ?? t("IP unavailable"),
                        mono: true,
                      },
                      { label: t("Time"), value: formatDateTime(request.createdAt, locale) },
                      { label: t("Endpoint"), value: request.endpoint || "—", mono: true },
                      { label: t("API key"), value: request.apiKeyName ?? "—" },
                      { label: t("Account group"), value: request.group ?? "—", mono: true },
                      {
                        label: t("Status code"),
                        value: request.statusCode === null ? "—" : String(request.statusCode),
                        mono: true,
                      },
                    ]}
                  />
                </DetailSection>

                <DetailSection
                  icon={<BracesIcon aria-hidden="true" />}
                  title={t("Request configuration")}
                >
                  <DetailList
                    rows={[
                      { label: t("Model"), value: request.model ?? "—", mono: true },
                      {
                        label: t("Streaming"),
                        value:
                          request.isStream == null ? "—" : request.isStream ? t("Yes") : t("No"),
                      },
                    ]}
                  />
                </DetailSection>

                {request.task && (
                  <DetailSection
                    icon={<ActivityIcon aria-hidden="true" />}
                    title={t("Task information")}
                  >
                    <DetailList
                      rows={[
                        ...(request.task.id
                          ? [{ label: t("Task ID"), value: request.task.id, mono: true }]
                          : []),
                        ...(request.task.platform
                          ? [
                              {
                                label: t("Task platform"),
                                value: request.task.platform,
                                mono: true,
                              },
                            ]
                          : []),
                        ...(request.task.action
                          ? [{ label: t("Task action"), value: request.task.action, mono: true }]
                          : []),
                        ...(request.task.status
                          ? [{ label: t("Task status"), value: request.task.status, mono: true }]
                          : []),
                        ...(request.task.durationMs != null
                          ? [
                              {
                                label: t("Task duration"),
                                value: formatLatency(request.task.durationMs, locale),
                                mono: true,
                              },
                            ]
                          : []),
                        ...(request.task.refundedCost != null
                          ? [
                              {
                                label: t("Refunded amount"),
                                value: formatPreciseCurrency(request.task.refundedCost, locale),
                                mono: true,
                              },
                            ]
                          : []),
                        ...(request.task.failureReason
                          ? [{ label: t("Failure reason"), value: request.task.failureReason }]
                          : []),
                        ...(request.task.refundReason
                          ? [{ label: t("Refund reason"), value: request.task.refundReason }]
                          : []),
                      ]}
                    />
                  </DetailSection>
                )}
              </TabsContent>

              <TabsContent className="flex flex-col gap-4 p-4" value="usage">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ObservationMetric
                    label={t("Input tokens")}
                    value={formatNumber(request.inputTokens, locale)}
                  />
                  <ObservationMetric
                    label={t("Output tokens")}
                    value={formatNumber(request.outputTokens, locale)}
                  />
                  <ObservationMetric
                    label={t("Total tokens")}
                    value={formatNumber(totalTokens, locale)}
                  />
                  <ObservationMetric
                    icon={<CoinsIcon aria-hidden="true" />}
                    label={t("Cost")}
                    value={formatPreciseCurrency(request.cost, locale)}
                  />
                </div>

                <DetailSection icon={<ActivityIcon aria-hidden="true" />} title={t("Token usage")}>
                  <DetailList
                    rows={[
                      {
                        label: t("Total tokens"),
                        value: formatNumber(totalTokens, locale),
                        mono: true,
                      },
                      {
                        label: t("Input tokens"),
                        value: formatNumber(request.inputTokens, locale),
                        mono: true,
                      },
                      {
                        label: t("Output tokens"),
                        value: formatNumber(request.outputTokens, locale),
                        mono: true,
                      },
                      ...(request.inputTokensTotal != null
                        ? [
                            {
                              label: t("Total input tokens"),
                              value: formatNumber(request.inputTokensTotal, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.cacheReadTokens != null
                        ? [
                            {
                              label: t("Cache read"),
                              value: formatNumber(request.cacheReadTokens, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.cacheWrite5mTokens != null
                        ? [
                            {
                              label: t("5m cache write"),
                              value: formatNumber(request.cacheWrite5mTokens, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.cacheWrite1hTokens != null
                        ? [
                            {
                              label: t("1h cache write"),
                              value: formatNumber(request.cacheWrite1hTokens, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.cacheWriteTokens != null
                        ? [
                            {
                              label: t("Cache write total"),
                              value: formatNumber(request.cacheWriteTokens, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.imageTokens != null
                        ? [
                            {
                              label: t("Image tokens"),
                              value: formatNumber(request.imageTokens, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...tokenDetailRows(request, t, locale),
                    ]}
                  />
                </DetailSection>

                {request.toolSurcharges && request.toolSurcharges.length > 0 && (
                  <DetailSection
                    icon={<CoinsIcon aria-hidden="true" />}
                    title={t("Tool call charges")}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("Tool")}</TableHead>
                          <TableHead className="text-right">{t("Calls")}</TableHead>
                          <TableHead className="text-right">{t("Price per 1K calls")}</TableHead>
                          <TableHead className="text-right">{t("Charge")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {request.toolSurcharges.map((item) => (
                          <TableRow key={`${item.name}-${item.unitPrice}`}>
                            <TableCell className="font-mono text-xs">{item.name}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatNumber(item.count, locale)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatPreciseCurrency(item.unitPrice, locale)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {formatPreciseCurrency(item.totalCost, locale)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </DetailSection>
                )}

                <DetailSection
                  icon={<CoinsIcon aria-hidden="true" />}
                  title={t("Settlement details")}
                >
                  <DetailList
                    rows={[
                      {
                        label: t("Cost"),
                        value: formatPreciseCurrency(request.cost, locale),
                        mono: true,
                      },
                      ...(request.billingSource
                        ? [
                            {
                              label: t("Funding source"),
                              value: billingSourceLabel(request.billingSource, t),
                            },
                          ]
                        : []),
                      ...(request.billingPreference
                        ? [
                            {
                              label: t("Billing preference"),
                              value: billingPreferenceLabel(request.billingPreference, t),
                            },
                          ]
                        : []),
                      ...(request.billingStage
                        ? [
                            {
                              label: t("Settlement status"),
                              value: billingStageLabel(request.billingStage, t),
                            },
                          ]
                        : []),
                      ...(request.subscriptionPlanTitle
                        ? [{ label: t("Subscription plan"), value: request.subscriptionPlanTitle }]
                        : []),
                      ...(request.subscriptionConsumedCost != null
                        ? [
                            {
                              label: t("Subscription usage for this request"),
                              value: formatPreciseCurrency(
                                request.subscriptionConsumedCost,
                                locale,
                              ),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.subscriptionRemainingCost != null
                        ? [
                            {
                              label: t("Subscription remaining"),
                              value: formatPreciseCurrency(
                                request.subscriptionRemainingCost,
                                locale,
                              ),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.finalCost != null
                        ? [
                            {
                              label: t("Final charge"),
                              value: formatPreciseCurrency(request.finalCost, locale),
                              mono: true,
                            },
                          ]
                        : []),
                      ...(request.outstandingCost != null && request.outstandingCost !== 0
                        ? [
                            {
                              label: t("Unsettled amount"),
                              value: (
                                <span className="font-medium text-destructive">
                                  {formatPreciseCurrency(request.outstandingCost, locale)}
                                </span>
                              ),
                              mono: true,
                            },
                          ]
                        : []),
                    ]}
                  />
                </DetailSection>
              </TabsContent>

              <TabsContent className="flex flex-col gap-4 p-4" value="diagnostics">
                <DetailSection
                  icon={<BracesIcon aria-hidden="true" />}
                  title={t("Service diagnostics")}
                >
                  <DetailList
                    rows={[
                      { label: t("Endpoint"), value: request.endpoint || "—", mono: true },
                      { label: t("Model"), value: request.model ?? "—", mono: true },
                      {
                        label: t("Streaming"),
                        value:
                          request.isStream == null ? "—" : request.isStream ? t("Yes") : t("No"),
                      },
                      {
                        label: t("Reasoning effort"),
                        value: request.reasoningEffort ?? "—",
                        mono: true,
                      },
                      ...(request.usageCountSource
                        ? [
                            {
                              label: t("Usage source"),
                              value: usageSourceLabel(request.usageCountSource, t),
                            },
                          ]
                        : []),
                      ...(request.usageSemantic
                        ? [
                            {
                              label: t("Usage semantics"),
                              value: usageSemanticLabel(request.usageSemantic, t),
                            },
                          ]
                        : []),
                      ...(request.errorType
                        ? [{ label: t("Error type"), value: request.errorType, mono: true }]
                        : []),
                      ...(request.requestPolicyApplied
                        ? [{ label: t("Request policy"), value: t("Applied") }]
                        : []),
                    ]}
                  />
                </DetailSection>

                <DetailSection icon={<GaugeIcon aria-hidden="true" />} title={t("Runtime")}>
                  <DetailList
                    rows={[
                      {
                        label: t("Latency"),
                        value: formatLatency(request.latencyMs, locale),
                        mono: true,
                      },
                      {
                        label: t("First token latency"),
                        value: formatLatency(request.firstTokenLatencyMs ?? null, locale),
                        mono: true,
                      },
                      { label: t("Output throughput"), value: throughputLabel, mono: true },
                    ]}
                  />
                </DetailSection>

                {request.streamStatus && (
                  <DetailSection title={t("Stream status")}>
                    <DetailList
                      rows={[
                        {
                          label: t("Status"),
                          value: request.streamStatus.status ?? "—",
                          mono: true,
                        },
                        {
                          label: t("End reason"),
                          value: request.streamStatus.endReason ?? "—",
                          mono: true,
                        },
                        {
                          label: t("Soft errors"),
                          value:
                            request.streamStatus.errorCount === null
                              ? "—"
                              : formatNumber(request.streamStatus.errorCount, locale),
                          mono: true,
                        },
                        ...(request.streamStatus.endError
                          ? [
                              {
                                label: t("Error"),
                                value: request.streamStatus.endError,
                                mono: true,
                              },
                            ]
                          : []),
                      ]}
                    />
                    {request.streamStatus.errors.length > 0 && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                        {request.streamStatus.errors.join("\n")}
                      </pre>
                    )}
                  </DetailSection>
                )}

                {request.content && request.content !== request.errorMessage && (
                  <DetailSection title={t("Content")}>
                    <pre className="max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                      {request.content}
                    </pre>
                  </DetailSection>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

function tokenDetailRows(request: RequestLogRecord, t: TFunction, locale: string): DetailRow[] {
  const details: Array<[number | undefined, string]> = [
    [request.textInputTokens, t("Text input tokens")],
    [request.textOutputTokens, t("Text output tokens")],
    [request.audioInputTokens, t("Audio input tokens")],
    [request.audioOutputTokens, t("Audio output tokens")],
  ];
  return details.flatMap(([value, label]) =>
    value == null ? [] : [{ label, value: formatNumber(value, locale), mono: true }],
  );
}

function billingSourceLabel(value: string, t: TFunction) {
  if (value === "wallet" || value === "balance") return t("Account balance");
  if (value === "subscription") return t("Subscription");
  return t("Other funding source");
}

function billingPreferenceLabel(value: string, t: TFunction) {
  if (value === "subscription_first") return t("Subscription first");
  if (value === "wallet_first") return t("Account balance first");
  if (value === "subscription_only") return t("Subscription only");
  if (value === "wallet_only") return t("Account balance only");
  return t("Default billing order");
}

function billingStageLabel(value: string, t: TFunction) {
  if (value === "completed") return t("Settled");
  if (value === "settlement_failed") return t("Settlement pending");
  if (value === "submitted") return t("Submitted");
  return t("Recorded");
}

function usageSourceLabel(value: string, t: TFunction) {
  if (value === "locally_counted") return t("Locally counted");
  if (value === "service_reported") return t("Service-reported usage");
  if (value === "normalized_estimate") return t("Estimated normalized usage");
  if (value === "normalized_usage") return t("Normalized usage");
  return t("Recorded usage");
}

function usageSemanticLabel(value: string, t: TFunction) {
  if (value === "anthropic") return t("Anthropic usage semantics");
  if (value === "openai") return t("OpenAI usage semantics");
  if (value === "gemini") return t("Gemini usage semantics");
  return t("Recorded usage semantics");
}

export function RequestStatusBadge(props: { status: RequestLogRecord["status"] }) {
  const { t } = useTranslation();
  if (props.status === "failed") return <Badge variant="destructive">{t("Failed")}</Badge>;
  if (props.status === "processing") return <Badge variant="outline">{t("Processing")}</Badge>;
  return <Badge variant="secondary">{t("Succeeded")}</Badge>;
}

function ObservationMetric(props: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {props.icon}
          {props.label}
        </CardDescription>
        <CardTitle className="text-lg">{props.value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function DetailSection(props: { title: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          {props.icon}
          {props.title}
        </CardTitle>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </Card>
  );
}

function DetailList(props: { rows: DetailRow[] }) {
  return (
    <dl>
      {props.rows.map((row, index) => (
        <Fragment key={`${row.label}-${index}`}>
          {index > 0 && <Separator />}
          <div className="grid min-w-0 gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-xs text-muted-foreground">{row.label}</dt>
            <dd className={row.mono ? "min-w-0 break-all font-mono text-xs" : "min-w-0 text-sm"}>
              {row.value}
            </dd>
          </div>
        </Fragment>
      ))}
    </dl>
  );
}

function CopyableValue(props: {
  value: string;
  onCopy(value: string, message: string): Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 break-all">{props.value}</span>
      <Button
        aria-label={t("Copy")}
        onClick={() => void props.onCopy(props.value, t("Copied to clipboard"))}
        size="icon-xs"
        variant="ghost"
      >
        <CopyIcon />
      </Button>
    </span>
  );
}
