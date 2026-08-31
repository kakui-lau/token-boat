import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BellRingIcon,
  LoaderCircleIcon,
  RadioTowerIcon,
  RefreshCwIcon,
  Settings2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { DataLoadError } from "@/components/data-load-error";
import { PageHeader } from "@/components/page-header";
import type { AlertCenterData, AlertRule, PlatformMonitor } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  activeAlertRuleCount,
  alertRuleStatusLabel,
  alertThresholdKey,
  channelLabel,
  monitorStatusDetails,
  platformStatusDetails,
} from "../lib/alert-status";

type AlertsPageProps = {
  onManageAlerts(): void;
};

export function AlertsPage(props: AlertsPageProps) {
  const { t, i18n } = useTranslation();
  const query = useQuery({
    queryKey: ["alert-center"],
    queryFn: () => repository.getAlertCenter(),
  });
  const locale = i18n.resolvedLanguage ?? "zh";
  let pageContent: ReactNode;
  if (query.isPending) {
    pageContent = <AlertsPageSkeleton />;
  } else if (query.isError) {
    pageContent = (
      <DataLoadError
        description={t("Try refreshing the page or check the API connection.")}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        title={t("Unable to load alerts and status")}
      />
    );
  } else {
    pageContent = (
      <AlertsPageContent
        data={query.data}
        locale={locale}
        onManageAlerts={props.onManageAlerts}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  return (
    <div aria-busy={query.isPending} className="flex flex-col gap-6">
      <PageHeader
        action={
          <Button onClick={props.onManageAlerts}>
            <Settings2Icon data-icon="inline-start" />
            {t("Manage alert settings")}
          </Button>
        }
        description={t("Monitor balance, spend, errors, latency, and platform incidents.")}
        title={t("Alerts and status")}
      />
      {pageContent}
    </div>
  );
}

function AlertsPageSkeleton() {
  const { t } = useTranslation();

  return (
    <div aria-label={t("Loading alerts and status")} className="flex flex-col gap-6" role="status">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 md:col-span-2" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-20" />
      <Skeleton className="h-52" />
      <Skeleton className="h-60" />
      <Skeleton className="h-48" />
    </div>
  );
}

function AlertsPageContent(props: {
  data: AlertCenterData;
  locale: string;
  onManageAlerts(): void;
  onRetry(): void;
  retrying: boolean;
}) {
  const { t } = useTranslation();
  const activeRuleCount = activeAlertRuleCount(props.data.rules);
  const statusDetails = platformStatusDetails(props.data.platform.status);
  const StatusIcon = statusDetails.icon;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t("Platform status")}</CardTitle>
            <CardDescription>
              {t("Current health reported by the configured status monitors.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground">
                <StatusIcon aria-hidden="true" />
              </span>
              <div>
                <div className="font-medium">{t(statusDetails.label)}</div>
                <div className="text-xs text-muted-foreground">{t(statusDetails.description)}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant={statusDetails.badgeVariant}>
                {props.data.platform.uptimePercent === null
                  ? t("Uptime unavailable")
                  : t("{{uptime}}% minimum 24-hour uptime", {
                      uptime: props.data.platform.uptimePercent.toFixed(2),
                    })}
              </Badge>
              {props.data.platform.status === "unknown" ? (
                <Button
                  disabled={props.retrying}
                  onClick={props.onRetry}
                  size="sm"
                  variant="outline"
                >
                  {props.retrying ? (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  ) : (
                    <RefreshCwIcon data-icon="inline-start" />
                  )}
                  {t(props.retrying ? "Retrying…" : "Retry status")}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("Active alert rules")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{activeRuleCount ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t("Backed by saved account notification settings.")}
          </CardContent>
        </Card>
      </div>

      <Alert>
        <BellRingIcon aria-hidden="true" />
        <AlertTitle>{t("Current alert coverage")}</AlertTitle>
        <AlertDescription>
          {t(
            "Low-balance notifications are available now. Spend, error-rate, and latency rules require the workspace alert service.",
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t("Service monitors")}</CardTitle>
          <CardDescription>
            {t("Each monitor shows its current state and minimum 24-hour uptime.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.data.platform.monitors.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {props.data.platform.monitors.map((monitor) => (
                <MonitorItem key={monitor.id} monitor={monitor} />
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RadioTowerIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {t(
                    props.data.platform.status === "unconfigured"
                      ? "No service monitors configured"
                      : "Service monitor data unavailable",
                  )}
                </EmptyTitle>
                <EmptyDescription>
                  {t(
                    props.data.platform.status === "unconfigured"
                      ? "Platform health will appear after the status provider is configured."
                      : "The status endpoint did not return any service monitors.",
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Alert rules")}</CardTitle>
          <CardDescription>
            {t("Notification destinations are managed in account settings.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.data.rules.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {props.data.rules.map((rule) => (
                <Item key={rule.id} variant="outline">
                  <ItemMedia className="size-9 rounded-lg bg-muted" variant="icon">
                    <BellRingIcon aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {t(rule.name)}
                      <Badge variant="outline">{t(channelLabel(rule.channel))}</Badge>
                    </ItemTitle>
                    <ItemDescription>
                      {rule.threshold === null
                        ? t("Using the server default threshold")
                        : t(alertThresholdKey(rule), {
                            threshold: formatAlertThreshold(rule, props.locale),
                          })}
                    </ItemDescription>
                    {rule.lastTriggeredAt !== null ? (
                      <ItemDescription>
                        {t("Last triggered")}: {formatDateTime(rule.lastTriggeredAt, props.locale)}
                      </ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={rule.enabled === true ? "secondary" : "outline"}>
                      {t(alertRuleStatusLabel(rule.enabled))}
                    </Badge>
                    <Button onClick={props.onManageAlerts} size="sm" variant="outline">
                      {t("Manage")}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </div>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BellRingIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("No alert rules configured")}</EmptyTitle>
                <EmptyDescription>
                  {t("Configure an account notification destination to receive balance warnings.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RadioTowerIcon aria-hidden="true" />
            {t("Incident history")}
          </CardTitle>
          <CardDescription>
            {t("Resolved platform events that may explain unusual customer traffic.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {props.data.incidents.length > 0 ? (
            props.data.incidents.map((incident) => (
              <Item key={incident.id} variant="outline">
                <ItemContent>
                  <ItemTitle>{t(incident.title)}</ItemTitle>
                  <ItemDescription>
                    {formatDateTime(incident.startedAt, props.locale)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Badge variant="secondary">
                    {t(incident.status === "monitoring" ? "Monitoring" : "Resolved")}
                  </Badge>
                </ItemActions>
              </Item>
            ))
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <RadioTowerIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("No incident history available")}</EmptyTitle>
                <EmptyDescription>
                  {t("The current status provider does not expose historical incidents.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function MonitorItem(props: { monitor: PlatformMonitor }) {
  const { t } = useTranslation();
  const details = monitorStatusDetails(props.monitor.status);
  const MonitorIcon = details.icon;

  return (
    <Item variant="outline">
      <ItemMedia className="size-9 rounded-lg bg-muted" variant="icon">
        <MonitorIcon aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{props.monitor.name}</ItemTitle>
        <ItemDescription>{props.monitor.group}</ItemDescription>
      </ItemContent>
      <ItemActions className="flex-col items-end gap-1">
        <Badge variant={details.badgeVariant}>{t(details.label)}</Badge>
        <span className="text-xs tabular-nums text-muted-foreground">
          {props.monitor.uptimePercent === null
            ? t("Uptime unavailable")
            : `${props.monitor.uptimePercent.toFixed(2)}%`}
        </span>
      </ItemActions>
    </Item>
  );
}

function formatAlertThreshold(rule: AlertRule, locale: string): string | number {
  if (rule.threshold === null) return "";
  if (rule.type === "balance" || rule.type === "spend") {
    return formatCurrency(rule.threshold, locale);
  }
  return rule.threshold;
}
