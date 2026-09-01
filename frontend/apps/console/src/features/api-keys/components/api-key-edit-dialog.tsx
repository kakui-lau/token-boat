import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Switch } from "@token-boat/ui/components/ui/switch";
import type { ApiKeyRecord, UpdateApiKeyInput } from "@/data/contracts";
import { formatDateTime } from "@/lib/format";
import {
  ApiKeyGroupSelect,
  ApiKeyModelSelect,
  useApiKeyGroupOptions,
  useApiKeyModelOptions,
} from "./api-key-access-selectors";
import { ExpiryDateTimePicker } from "./expiry-date-time-picker";

type ApiKeyEditDialogProps = {
  apiKey: ApiKeyRecord;
  locale: string;
  onOpenChange(open: boolean): void;
  onSubmit(input: UpdateApiKeyInput): void;
  pending: boolean;
  showEnvironment: boolean;
};

type EditForm = {
  allowedIps: string;
  allowedModels: string[];
  environment: ApiKeyRecord["environment"];
  expiresAt: number | null;
  group: string;
  name: string;
  remainingQuotaUsd: number;
  unlimitedQuota: boolean;
};

export function ApiKeyEditDialog(props: ApiKeyEditDialogProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<EditForm>(() => ({
    allowedIps: props.apiKey.allowedIps.join(", "),
    allowedModels: props.apiKey.allowedModels,
    environment: props.apiKey.environment,
    expiresAt: props.apiKey.expiresAt,
    group: props.apiKey.group,
    name: props.apiKey.name,
    remainingQuotaUsd: props.apiKey.remainingQuotaUsd,
    unlimitedQuota: props.apiKey.unlimitedQuota,
  }));
  const groupOptions = useApiKeyGroupOptions(true);
  const modelOptions = useApiKeyModelOptions(form.group, groupOptions.isSuccess);
  const formValid =
    form.name.trim().length > 0 &&
    form.name.trim().length <= 50 &&
    groupOptions.data?.some((option) => option.value === form.group) === true &&
    modelOptions.isSuccess &&
    (form.unlimitedQuota ||
      (Number.isFinite(form.remainingQuotaUsd) && form.remainingQuotaUsd >= 0));

  const submit = () => {
    if (!formValid || props.pending) return;
    props.onSubmit({
      id: props.apiKey.id,
      name: form.name.trim(),
      expiresAt: form.expiresAt,
      unlimitedQuota: form.unlimitedQuota,
      remainingQuotaUsd: form.unlimitedQuota ? 0 : form.remainingQuotaUsd,
      group: form.group.trim(),
      environment: form.environment,
      allowedModels: form.allowedModels,
      allowedIps: parseList(form.allowedIps),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && props.pending) return;
        props.onOpenChange(open);
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        closeLabel={t("Close")}
        showCloseButton={!props.pending}
      >
        <DialogHeader>
          <DialogTitle>{t("Edit API key")}</DialogTitle>
          <DialogDescription>
            {t("Update access boundaries without exposing or rotating the existing secret.")}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={form.name.trim().length > 50 || undefined}>
            <FieldLabel htmlFor="edit-key-name">{t("Name")}</FieldLabel>
            <Input
              aria-invalid={form.name.trim().length > 50 || undefined}
              id="edit-key-name"
              maxLength={51}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              value={form.name}
            />
            <FieldDescription>
              {t("Use an application or environment-specific name.")}
            </FieldDescription>
          </Field>

          <div
            className={
              props.showEnvironment ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"
            }
          >
            {props.showEnvironment && (
              <Field>
                <FieldLabel id="edit-key-environment">{t("Environment")}</FieldLabel>
                <Select
                  onValueChange={(value) => {
                    if (!value) return;
                    setForm((current) => ({
                      ...current,
                      environment: value as ApiKeyRecord["environment"],
                    }));
                  }}
                  value={form.environment}
                >
                  <SelectTrigger aria-labelledby="edit-key-environment" className="w-full">
                    <SelectValue>{t(environmentLabel(form.environment))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="development">{t("Development")}</SelectItem>
                      <SelectItem value="staging">{t("Staging")}</SelectItem>
                      <SelectItem value="production">{t("Production")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="edit-key-group">{t("Group")}</FieldLabel>
              <ApiKeyGroupSelect
                error={groupOptions.isError}
                id="edit-key-group"
                loading={groupOptions.isPending}
                onRetry={() => void groupOptions.refetch()}
                onValueChange={(group) =>
                  setForm((current) => ({ ...current, group, allowedModels: [] }))
                }
                options={groupOptions.data ?? []}
                value={form.group}
              />
            </Field>

            <Field>
              <FieldLabel id="edit-key-expiry">{t("Expiration")}</FieldLabel>
              <ExpiryDateTimePicker
                initialValue={props.apiKey.expiresAt}
                labelledBy="edit-key-expiry"
                locale={props.locale}
                onChange={(expiresAt) => setForm((current) => ({ ...current, expiresAt }))}
                showKeepCurrent
                value={form.expiresAt}
              />
              <FieldDescription>
                {props.apiKey.expiresAt
                  ? t("Current: {{date}}", {
                      date: formatDateTime(props.apiKey.expiresAt, props.locale),
                    })
                  : t("Current: Never")}
              </FieldDescription>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="edit-key-models">{t("Allowed models")}</FieldLabel>
              <ApiKeyModelSelect
                error={modelOptions.isError}
                id="edit-key-models"
                loading={
                  groupOptions.isPending || (form.group.length > 0 && modelOptions.isPending)
                }
                onRetry={() => void modelOptions.refetch()}
                onValueChange={(allowedModels) =>
                  setForm((current) => ({ ...current, allowedModels }))
                }
                options={modelOptions.data ?? []}
                value={form.allowedModels}
              />
              <FieldDescription>
                {t("Leave empty to allow every model in the account group.")}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-key-ips">{t("Allowed IP ranges")}</FieldLabel>
              <Input
                id="edit-key-ips"
                onChange={(event) =>
                  setForm((current) => ({ ...current, allowedIps: event.target.value }))
                }
                placeholder="203.0.113.0/24"
                value={form.allowedIps}
              />
              <FieldDescription>
                {t("Optional comma-separated IP addresses or CIDR ranges.")}
              </FieldDescription>
            </Field>
          </div>

          <Field orientation="horizontal">
            <FieldLabel htmlFor="edit-unlimited-quota">
              <Field>
                <FieldLabel>{t("Unlimited quota")}</FieldLabel>
                <FieldDescription>
                  {t("Use the account balance without a per-key limit.")}
                </FieldDescription>
              </Field>
            </FieldLabel>
            <Switch
              checked={form.unlimitedQuota}
              id="edit-unlimited-quota"
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, unlimitedQuota: checked }))
              }
            />
          </Field>

          {!form.unlimitedQuota && (
            <Field data-invalid={form.remainingQuotaUsd < 0 || undefined}>
              <FieldLabel htmlFor="edit-key-quota">{t("Remaining quota (USD)")}</FieldLabel>
              <Input
                aria-invalid={form.remainingQuotaUsd < 0 || undefined}
                id="edit-key-quota"
                min={0}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    remainingQuotaUsd: Number(event.target.value),
                  }))
                }
                step="any"
                type="number"
                value={form.remainingQuotaUsd}
              />
              <FieldDescription>
                {t("Changing this value replaces the current remaining key quota.")}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>

        <DialogFooter>
          <Button
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {t("Cancel")}
          </Button>
          <Button disabled={!formValid || props.pending} onClick={submit}>
            {props.pending && (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            )}
            {t("Save changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function environmentLabel(environment: ApiKeyRecord["environment"]): string {
  if (environment === "development") return "Development";
  if (environment === "staging") return "Staging";
  if (environment === "production") return "Production";
  return "Not recorded";
}
