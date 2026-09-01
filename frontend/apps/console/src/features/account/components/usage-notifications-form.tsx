import { BellRingIcon, LoaderCircleIcon, MailIcon, ServerIcon, WebhookIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import { Switch } from "@token-boat/ui/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { AccountPreferences } from "@/data/contracts";

type UsageNotificationsFormProps = {
  pending: boolean;
  value: AccountPreferences;
  onChange(value: AccountPreferences): void;
  onSubmit(): void;
};

const notificationChannels = [
  { icon: MailIcon, label: "Email", value: "email" },
  { icon: WebhookIcon, label: "Webhook", value: "webhook" },
  { icon: BellRingIcon, label: "Bark", value: "bark" },
  { icon: ServerIcon, label: "Gotify", value: "gotify" },
] as const;

export function UsageNotificationsForm(props: UsageNotificationsFormProps) {
  const { t } = useTranslation();
  const channelInvalid = props.value.notifyType === null;
  const thresholdInvalid =
    props.value.balanceWarningThresholdUsd === null ||
    !Number.isFinite(props.value.balanceWarningThresholdUsd) ||
    props.value.balanceWarningThresholdUsd <= 0;
  const emailInvalid =
    props.value.notifyType === "email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(props.value.notificationEmail.trim());
  const webhookUrlInvalid =
    props.value.notifyType === "webhook" && !isHttpUrl(props.value.webhookUrl);
  const barkUrlInvalid = props.value.notifyType === "bark" && !isHttpUrl(props.value.barkUrl);
  const gotifyUrlInvalid = props.value.notifyType === "gotify" && !isHttpUrl(props.value.gotifyUrl);
  const gotifyTokenInvalid =
    props.value.notifyType === "gotify" &&
    !props.value.gotifyTokenConfigured &&
    !props.value.gotifyToken.trim();
  const gotifyPriorityInvalid =
    props.value.notifyType === "gotify" &&
    (!Number.isInteger(props.value.gotifyPriority) ||
      props.value.gotifyPriority < 0 ||
      props.value.gotifyPriority > 10);
  const formInvalid =
    channelInvalid ||
    thresholdInvalid ||
    emailInvalid ||
    webhookUrlInvalid ||
    barkUrlInvalid ||
    gotifyUrlInvalid ||
    gotifyTokenInvalid ||
    gotifyPriorityInvalid;

  return (
    <form
      className="max-w-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        if (formInvalid || props.pending) return;
        props.onSubmit();
      }}
    >
      <FieldGroup>
        <Field data-invalid={channelInvalid || undefined}>
          <FieldLabel id="notification-channel">{t("Notification channel")}</FieldLabel>
          <ToggleGroup
            aria-invalid={channelInvalid || undefined}
            aria-labelledby="notification-channel"
            className="grid w-full grid-cols-2 sm:grid-cols-4"
            onValueChange={(values) => {
              const value = values[0] as AccountPreferences["notifyType"] | undefined;
              if (value) props.onChange({ ...props.value, notifyType: value });
            }}
            spacing={2}
            value={props.value.notifyType ? [props.value.notifyType] : []}
            variant="outline"
          >
            {notificationChannels.map((channel) => (
              <ToggleGroupItem
                className="h-auto min-h-16 flex-col gap-1.5"
                key={channel.value}
                value={channel.value}
              >
                <channel.icon aria-hidden="true" className="size-4" />
                {t(channel.label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {channelInvalid ? (
            <FieldDescription>{t("Select a notification channel before saving.")}</FieldDescription>
          ) : null}
        </Field>

        <Field data-invalid={thresholdInvalid || undefined}>
          <FieldLabel htmlFor="warning-threshold">
            {t("Balance warning threshold (USD)")}
          </FieldLabel>
          <Input
            aria-invalid={thresholdInvalid || undefined}
            id="warning-threshold"
            min={0.01}
            onChange={(event) => {
              const rawValue = event.target.value;
              props.onChange({
                ...props.value,
                balanceWarningThresholdUsd: rawValue === "" ? null : Number(rawValue),
              });
            }}
            required
            step="0.01"
            type="number"
            value={props.value.balanceWarningThresholdUsd ?? ""}
          />
          <FieldDescription>
            {props.value.balanceWarningThresholdUsd === null
              ? t("The server default is active. Enter an explicit amount before saving changes.")
              : t("Notify me when the account balance falls below this amount.")}
          </FieldDescription>
        </Field>

        {props.value.notifyType === "email" && (
          <Field data-invalid={emailInvalid || undefined}>
            <FieldLabel htmlFor="notification-email">{t("Notification email")}</FieldLabel>
            <Input
              aria-invalid={emailInvalid || undefined}
              id="notification-email"
              onChange={(event) =>
                props.onChange({ ...props.value, notificationEmail: event.target.value })
              }
              required
              type="email"
              value={props.value.notificationEmail}
            />
            {emailInvalid ? (
              <FieldDescription>{t("Enter a valid notification email address.")}</FieldDescription>
            ) : null}
          </Field>
        )}

        {props.value.notifyType === "webhook" && (
          <>
            <Field data-invalid={webhookUrlInvalid || undefined}>
              <FieldLabel htmlFor="webhook-url">{t("Webhook URL")}</FieldLabel>
              <Input
                aria-invalid={webhookUrlInvalid || undefined}
                id="webhook-url"
                onChange={(event) =>
                  props.onChange({ ...props.value, webhookUrl: event.target.value })
                }
                placeholder="https://example.com/hooks/quota"
                required
                type="url"
                value={props.value.webhookUrl}
              />
              {webhookUrlInvalid ? (
                <FieldDescription>{t("Enter a complete HTTP or HTTPS URL.")}</FieldDescription>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="webhook-secret">{t("Webhook secret")}</FieldLabel>
              <Input
                autoComplete="new-password"
                id="webhook-secret"
                onChange={(event) =>
                  props.onChange({ ...props.value, webhookSecret: event.target.value })
                }
                type="password"
                value={props.value.webhookSecret}
              />
              {props.value.webhookSecretConfigured && (
                <FieldDescription>{t("Leave blank to keep the current secret.")}</FieldDescription>
              )}
            </Field>
          </>
        )}

        {props.value.notifyType === "bark" && (
          <Field data-invalid={barkUrlInvalid || undefined}>
            <FieldLabel htmlFor="bark-url">{t("Bark push URL")}</FieldLabel>
            <Input
              aria-invalid={barkUrlInvalid || undefined}
              id="bark-url"
              onChange={(event) => props.onChange({ ...props.value, barkUrl: event.target.value })}
              placeholder="https://api.day.app/your-key/{{title}}/{{content}}"
              required
              type="url"
              value={props.value.barkUrl}
            />
            {barkUrlInvalid ? (
              <FieldDescription>{t("Enter a complete HTTP or HTTPS URL.")}</FieldDescription>
            ) : null}
          </Field>
        )}

        {props.value.notifyType === "gotify" && (
          <>
            <Field data-invalid={gotifyUrlInvalid || undefined}>
              <FieldLabel htmlFor="gotify-url">{t("Gotify server URL")}</FieldLabel>
              <Input
                aria-invalid={gotifyUrlInvalid || undefined}
                id="gotify-url"
                onChange={(event) =>
                  props.onChange({ ...props.value, gotifyUrl: event.target.value })
                }
                placeholder="https://gotify.example.com"
                required
                type="url"
                value={props.value.gotifyUrl}
              />
              {gotifyUrlInvalid ? (
                <FieldDescription>{t("Enter a complete HTTP or HTTPS URL.")}</FieldDescription>
              ) : null}
            </Field>
            <Field data-invalid={gotifyTokenInvalid || undefined}>
              <FieldLabel htmlFor="gotify-token">{t("Gotify application token")}</FieldLabel>
              <Input
                aria-invalid={gotifyTokenInvalid || undefined}
                autoComplete="new-password"
                id="gotify-token"
                onChange={(event) =>
                  props.onChange({ ...props.value, gotifyToken: event.target.value })
                }
                required={!props.value.gotifyTokenConfigured}
                type="password"
                value={props.value.gotifyToken}
              />
              {gotifyTokenInvalid ? (
                <FieldDescription>{t("Enter the Gotify application token.")}</FieldDescription>
              ) : props.value.gotifyTokenConfigured ? (
                <FieldDescription>{t("Leave blank to keep the current token.")}</FieldDescription>
              ) : null}
            </Field>
            <Field data-invalid={gotifyPriorityInvalid || undefined}>
              <FieldLabel htmlFor="gotify-priority">{t("Message priority")}</FieldLabel>
              <Input
                aria-invalid={gotifyPriorityInvalid || undefined}
                id="gotify-priority"
                max={10}
                min={0}
                onChange={(event) =>
                  props.onChange({
                    ...props.value,
                    gotifyPriority:
                      event.target.value === "" ? Number.NaN : Number(event.target.value),
                  })
                }
                required
                type="number"
                value={
                  Number.isFinite(props.value.gotifyPriority) ? props.value.gotifyPriority : ""
                }
              />
              <FieldDescription>
                {gotifyPriorityInvalid
                  ? t("Enter a whole-number priority from 0 to 10.")
                  : t("Use a priority from 0 (lowest) to 10 (highest).")}
              </FieldDescription>
            </Field>
          </>
        )}

        <FieldSeparator />

        <Field data-disabled={props.value.recordIpForced || undefined} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="record-ip">{t("Record request IP")}</FieldLabel>
            <FieldDescription>
              {props.value.recordIpForced
                ? t("Request IP retention is required by the platform policy.")
                : t("Keep IP addresses in usage and error logs.")}
            </FieldDescription>
          </FieldContent>
          <Switch
            checked={props.value.recordIpForced || props.value.recordIpLog}
            disabled={props.value.recordIpForced}
            id="record-ip"
            onCheckedChange={(checked) => {
              if (!props.value.recordIpForced) {
                props.onChange({ ...props.value, recordIpLog: checked });
              }
            }}
          />
        </Field>

        <Button className="w-fit" disabled={props.pending || formInvalid} type="submit">
          {props.pending && <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />}
          {props.pending ? t("Saving…") : t("Save preferences")}
        </Button>
      </FieldGroup>
    </form>
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
