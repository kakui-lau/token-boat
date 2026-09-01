import {
  BoxesIcon,
  CalendarClockIcon,
  GaugeIcon,
  KeyRoundIcon,
  NetworkIcon,
  PencilIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Progress } from "@token-boat/ui/components/ui/progress";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
import { Separator } from "@token-boat/ui/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import type { ApiKeyRecord, ApiKeyStatus } from "@/data/contracts";
import { formatCurrency, formatDateTime } from "@/lib/format";

type ApiKeyDetailsSheetProps = {
  apiKey: ApiKeyRecord | null;
  locale: string;
  onEdit(apiKey: ApiKeyRecord): void;
  onOpenChange(open: boolean): void;
  showEnvironment: boolean;
};

export function ApiKeyDetailsSheet(props: ApiKeyDetailsSheetProps) {
  const { t } = useTranslation();
  const apiKey = props.apiKey;
  const totalQuotaUsd = apiKey ? apiKey.remainingQuotaUsd + apiKey.usedQuotaUsd : 0;
  const usedPercentage =
    apiKey && !apiKey.unlimitedQuota && totalQuotaUsd > 0
      ? Math.min((apiKey.usedQuotaUsd / totalQuotaUsd) * 100, 100)
      : 0;
  const identityRows: DetailRow[] = [];
  if (apiKey) {
    identityRows.push(
      { label: t("Name"), value: apiKey.name },
      { label: t("Key"), value: apiKey.maskedKey, mono: true },
      { label: t("Group"), value: apiKey.group, mono: true },
    );
    if (props.showEnvironment) {
      identityRows.push({
        label: t("Environment"),
        value: t(environmentLabel(apiKey.environment)),
      });
    }
    identityRows.push(
      {
        label: t("Created"),
        value: formatDateTime(apiKey.createdAt, props.locale),
      },
      {
        label: t("Last used"),
        value: apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt, props.locale) : t("Never"),
      },
    );
  }

  return (
    <Sheet open={apiKey !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-2xl"
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
            <SheetTitle>{t("API key details")}</SheetTitle>
            {apiKey && <ApiKeyStatusBadge status={apiKey.status} />}
          </div>
          <SheetDescription>
            {t("Review credential identity, quota, model access, and network restrictions.")}
          </SheetDescription>
          {apiKey && (
            <div className="flex min-w-0 items-center gap-2 pt-1">
              <span className="truncate font-medium text-foreground" title={apiKey.name}>
                {apiKey.name}
              </span>
              <code className="truncate text-xs text-muted-foreground">#{apiKey.id}</code>
            </div>
          )}
        </SheetHeader>

        {apiKey && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  icon={<GaugeIcon aria-hidden="true" />}
                  label={t("Remaining quota")}
                  value={
                    apiKey.unlimitedQuota
                      ? t("Unlimited")
                      : formatCurrency(apiKey.remainingQuotaUsd, props.locale, "USD")
                  }
                />
                <MetricCard
                  icon={<GaugeIcon aria-hidden="true" />}
                  label={t("Used quota")}
                  value={formatCurrency(apiKey.usedQuotaUsd, props.locale, "USD")}
                />
                <MetricCard
                  icon={<CalendarClockIcon aria-hidden="true" />}
                  label={t("Expires")}
                  value={
                    apiKey.expiresAt
                      ? formatDateTime(apiKey.expiresAt, props.locale)
                      : t("Never expires")
                  }
                />
              </div>

              {!apiKey.unlimitedQuota && (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>{t("Quota utilization")}</CardTitle>
                    <CardDescription>
                      {t("{{used}} of {{total}} quota used", {
                        used: formatCurrency(apiKey.usedQuotaUsd, props.locale, "USD"),
                        total: formatCurrency(totalQuotaUsd, props.locale, "USD"),
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Progress aria-label={t("Quota utilization")} value={usedPercentage} />
                  </CardContent>
                </Card>
              )}

              <DetailsCard
                description={t("The secret remains masked after its one-time creation view.")}
                icon={<KeyRoundIcon aria-hidden="true" />}
                rows={identityRows}
                title={t("Credential identity")}
              />

              <AccessCard
                description={t("Models this credential is allowed to call.")}
                emptyLabel={t("All models in the account group")}
                icon={<BoxesIcon aria-hidden="true" />}
                items={apiKey.allowedModels}
                title={t("Model access")}
              />

              <AccessCard
                description={t("Source addresses allowed to use this credential.")}
                emptyLabel={t("Any IP address")}
                icon={<NetworkIcon aria-hidden="true" />}
                items={apiKey.allowedIps}
                title={t("Network access")}
              />
            </div>
          </ScrollArea>
        )}

        {apiKey && (
          <SheetFooter className="border-t bg-background/95">
            <Button onClick={() => props.onEdit(apiKey)}>
              <PencilIcon data-icon="inline-start" />
              {t("Edit settings")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ApiKeyStatusBadge(props: { status: ApiKeyStatus }) {
  const { t } = useTranslation();
  let label = "Unknown";
  if (props.status === "active") label = "Active";
  else if (props.status === "disabled") label = "Disabled";
  else if (props.status === "expired") label = "Expired";
  else if (props.status === "exhausted") label = "Exhausted";

  let variant: "destructive" | "outline" | "secondary" = "destructive";
  if (props.status === "active") variant = "secondary";
  else if (props.status === "disabled") variant = "outline";
  return <Badge variant={variant}>{t(label)}</Badge>;
}

function MetricCard(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{props.icon}</span>
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{props.label}</span>
          <span className="mt-1 block truncate font-medium tabular-nums" title={props.value}>
            {props.value}
          </span>
        </span>
      </CardContent>
    </Card>
  );
}

type DetailRow = { label: string; value: string; mono?: boolean };

function DetailsCard(props: {
  description: string;
  icon: ReactNode;
  rows: DetailRow[];
  title: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground [&_svg]:size-4">{props.icon}</span>
          <CardTitle>{props.title}</CardTitle>
        </div>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          {props.rows.map((row, index) => (
            <div key={row.label}>
              {index > 0 && <Separator />}
              <div className="grid gap-1 py-2 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className={row.mono ? "break-all font-mono text-xs" : "break-words"}>
                  {row.value || "—"}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function AccessCard(props: {
  description: string;
  emptyLabel: string;
  icon: ReactNode;
  items: string[];
  title: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground [&_svg]:size-4">{props.icon}</span>
          <CardTitle>{props.title}</CardTitle>
        </div>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {props.items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {props.items.map((item) => (
              <Badge className="max-w-full font-mono" key={item} variant="outline">
                <span className="truncate" title={item}>
                  {item}
                </span>
              </Badge>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheckIcon aria-hidden="true" className="size-4" />
            {props.emptyLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function environmentLabel(environment: ApiKeyRecord["environment"]): string {
  if (environment === "development") return "Development";
  if (environment === "staging") return "Staging";
  if (environment === "production") return "Production";
  return "Not recorded";
}
