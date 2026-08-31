import { XIcon } from "lucide-react";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import { cn } from "@token-boat/ui/lib/utils";
import type { AccountActivityRecord, AccountActivityType } from "@/data/contracts";
import { formatDateTime } from "@/lib/format";

type ActivityDetailsSheetProps = {
  activity: AccountActivityRecord | null;
  onOpenChange(open: boolean): void;
};

export function ActivityDetailsSheet(props: ActivityDetailsSheetProps) {
  const { t, i18n } = useTranslation();
  const activity = props.activity;
  const locale = i18n.resolvedLanguage ?? "zh";

  return (
    <Sheet open={activity !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl"
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
            <SheetTitle>{t("Activity details")}</SheetTitle>
            {activity ? <ActivityTypeBadge type={activity.type} /> : null}
          </div>
          <SheetDescription>
            {t("Review the recorded account event and its available security context.")}
          </SheetDescription>
        </SheetHeader>

        {activity ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{activitySummary(activity, t)}</CardTitle>
                <CardDescription>{formatDateTime(activity.createdAt, locale)}</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <DetailValue label={t("Event ID")} mono value={activity.eventId} />
                  <DetailValue label={t("Category")} value={t(activityTypeLabel(activity.type))} />
                  <DetailValue label={t("Action identifier")} mono value={activity.action} />
                  <DetailValue label={t("Source IP")} mono value={activity.sourceIp} />
                  <DetailValue
                    label={t("Login method")}
                    value={loginMethodLabel(activity.loginMethod, t)}
                  />
                  <DetailValue label={t("User agent")} value={activity.userAgent} />
                </dl>
              </CardContent>
            </Card>

            {activity.content ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("Recorded description")}</CardTitle>
                  <CardDescription>
                    {t("Original description stored with this account event.")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm break-words">{activity.content}</CardContent>
              </Card>
            ) : null}

            {activity.parameters ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("Event parameters")}</CardTitle>
                  <CardDescription>
                    {t("Structured values recorded for this operation.")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-3">
                    {Object.entries(activity.parameters).map(([key, value]) => (
                      <DetailValue key={key} label={key} mono value={formatParameterValue(value)} />
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function ActivityTypeBadge(props: { type: AccountActivityType }) {
  const { t } = useTranslation();
  return (
    <Badge variant={props.type === "login" ? "secondary" : "outline"}>
      {t(activityTypeLabel(props.type))}
    </Badge>
  );
}

export function activitySummary(
  activity: AccountActivityRecord,
  t: (key: string) => string,
): string {
  if (activity.action === "login") return t("Signed in successfully");
  return activity.content ?? activity.action ?? t("Activity details unavailable");
}

function activityTypeLabel(type: AccountActivityType): string {
  if (type === "login") return "Sign-in";
  if (type === "management") return "Account operation";
  return "System event";
}

export function loginMethodLabel(method: string | null, t: (key: string) => string): string | null {
  if (method === null) return null;
  if (method === "password") return t("Password");
  if (method === "2fa") return t("Two-factor authentication");
  if (method === "passkey") return t("Passkey");
  if (method === "wechat") return t("WeChat");
  if (method === "telegram") return t("Telegram");
  if (method === "oauth") return t("OAuth");
  if (method.startsWith("oauth:")) return `${t("OAuth")} · ${method.slice(6)}`;
  return method;
}

function formatParameterValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? String(value);
}

function DetailValue(props: { label: string; mono?: boolean; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd
        className={cn("mt-1", props.mono ? "break-all font-mono text-xs" : "break-words text-sm")}
      >
        {props.value ?? "—"}
      </dd>
    </div>
  );
}
