import { AlertCircleIcon, ClockIcon, CoinsIcon, NetworkIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminRequestLog } from "@/repository/contracts";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
import { Separator } from "@token-boat/ui/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import {
  formatAdminCurrency,
  formatAdminDateTime,
  formatAdminLatency,
  formatAdminNumber,
} from "./admin-operation-format";

type AdminRequestDetailSheetProps = {
  onOpenChange(open: boolean): void;
  request: AdminRequestLog | null;
  timeZone: string;
};

export function AdminRequestDetailSheet(props: AdminRequestDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const request = props.request;
  const locale = i18n.resolvedLanguage ?? "zh";
  const totalTokens = request ? request.inputTokens + request.outputTokens : 0;

  return (
    <Sheet open={request !== null} onOpenChange={props.onOpenChange}>
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
            <SheetTitle>{t("requests.detailsTitle")}</SheetTitle>
            {request && <RequestStatusBadge status={request.status} />}
          </div>
          <SheetDescription>{t("requests.detailsDescription")}</SheetDescription>
          {request && (
            <code className="truncate pt-1 text-xs" title={request.requestId}>
              {request.requestId}
            </code>
          )}
        </SheetHeader>

        {request && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 p-4">
              {request.errorMessage && (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>{request.errorCode ?? t("requests.failed")}</AlertTitle>
                  <AlertDescription>{request.errorMessage}</AlertDescription>
                </Alert>
              )}

              <DetailSection icon={<NetworkIcon />} title={t("requests.traceContext")}>
                <DetailGrid
                  rows={[
                    [t("requests.requestId"), request.requestId, true],
                    [t("requests.serviceTraceId"), request.serviceTraceId ?? "—", true],
                    [
                      t("requests.time"),
                      formatAdminDateTime(request.createdAt, locale, props.timeZone),
                    ],
                    [t("requests.timeZone"), props.timeZone, true],
                    [t("requests.username"), request.username],
                    [t("requests.sourceIp"), request.sourceIp ?? "—", true],
                    [t("requests.apiKey"), request.apiKeyName ?? "—"],
                    [t("requests.group"), request.group ?? "—", true],
                  ]}
                />
              </DetailSection>

              <Separator />

              <DetailSection icon={<ClockIcon />} title={t("requests.routingAndPerformance")}>
                <DetailGrid
                  rows={[
                    [t("requests.endpoint"), request.endpoint ?? "—", true],
                    [t("requests.model"), request.model ?? "—", true],
                    [
                      t("requests.channel"),
                      request.channelName
                        ? `${request.channelName} · #${request.channelId ?? "—"}`
                        : request.channelId
                          ? `#${request.channelId}`
                          : "—",
                    ],
                    [t("requests.latency"), formatAdminLatency(request.latencyMs, locale)],
                    [
                      t("requests.firstTokenLatency"),
                      formatAdminLatency(request.firstTokenLatencyMs, locale),
                    ],
                    [
                      t("requests.statusCode"),
                      request.statusCode === null ? "—" : String(request.statusCode),
                      true,
                    ],
                    [t("requests.streaming"), request.isStream ? t("common.yes") : t("common.no")],
                    [t("requests.taskId"), request.taskId ?? "—", true],
                  ]}
                />
              </DetailSection>

              <Separator />

              <DetailSection icon={<CoinsIcon />} title={t("requests.usageAndBilling")}>
                <DetailGrid
                  rows={[
                    [
                      t("requests.inputTokens"),
                      formatAdminNumber(request.inputTokens, locale),
                      true,
                    ],
                    [
                      t("requests.outputTokens"),
                      formatAdminNumber(request.outputTokens, locale),
                      true,
                    ],
                    [t("requests.totalTokens"), formatAdminNumber(totalTokens, locale), true],
                    [t("requests.cost"), formatAdminCurrency(request.costUsd, locale), true],
                  ]}
                />
              </DetailSection>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function RequestStatusBadge({ status }: Pick<AdminRequestLog, "status">) {
  const { t } = useTranslation();
  return status === "failed" ? (
    <Badge variant="destructive">{t("requests.failed")}</Badge>
  ) : (
    <Badge variant="secondary">{t("requests.succeeded")}</Badge>
  );
}

function DetailSection(props: { children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {props.icon}
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function DetailGrid(props: { rows: Array<[string, string, boolean?]> }) {
  return (
    <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
      {props.rows.map(([label, value, mono]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className={mono ? "mt-1 break-words font-mono text-xs" : "mt-1 break-words text-sm"}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
