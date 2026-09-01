import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUpIcon,
  CheckIcon,
  CircleAlertIcon,
  ClipboardIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@token-boat/ui/components/ui/alert-dialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@token-boat/ui/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
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
import { Switch } from "@token-boat/ui/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@token-boat/ui/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { DataLoadError } from "@/components/data-load-error";
import { DataPagination } from "@/components/data-pagination";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableText } from "@/components/table-value";
import type {
  ApiKeyListInput,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreatedApiKey,
  PaginatedResult,
  UpdateApiKeyInput,
} from "@/data/contracts";
import { repository } from "@/data/repository";
import { useActionLock, useKeyedActionLock } from "@/hooks/use-action-lock";
import { copyText } from "@/lib/clipboard";
import { formatCurrency } from "@/lib/format";
import { type ApiKeySearch, type SearchPatch, useControllableSearch } from "@/lib/list-search";
import { ApiKeyDetailsSheet, ApiKeyStatusBadge } from "../components/api-key-details-sheet";
import { ApiKeyEditDialog } from "../components/api-key-edit-dialog";
import {
  ApiKeyGroupSelect,
  ApiKeyModelSelect,
  useApiKeyGroupOptions,
  useApiKeyModelOptions,
} from "../components/api-key-access-selectors";
import { ExpiryDateTimePicker } from "../components/expiry-date-time-picker";

function createInitialForm(group = ""): CreateApiKeyInput {
  const defaultExpiry = new Date();
  defaultExpiry.setDate(defaultExpiry.getDate() + 90);
  return {
    name: "",
    expiresAt: Math.floor(defaultExpiry.getTime() / 1000),
    unlimitedQuota: false,
    quotaUsd: 10,
    group,
    environment: "production",
    allowedModels: [],
    allowedIps: [],
  };
}

type ApiKeysPageProps = {
  defaultGroup?: string;
  onSearchChange?: (patch: SearchPatch<ApiKeySearch>) => void;
  search?: ApiKeySearch;
};

export function ApiKeysPage(props: ApiKeysPageProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => createInitialForm(props.defaultGroup));
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [createdSecretCopied, setCreatedSecretCopied] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyRecord | null>(null);
  const [togglingKeyIds, setTogglingKeyIds] = useState(() => new Set<number>());
  const createLock = useActionLock();
  const toggleLock = useKeyedActionLock<number>();
  const updateLock = useActionLock();
  const revokeLock = useActionLock();
  const showEnvironment = repository.mode === "demo";
  const groupOptions = useApiKeyGroupOptions(createOpen);
  const modelOptions = useApiKeyModelOptions(form.group, createOpen && groupOptions.isSuccess);
  const [search, updateSearch] = useControllableSearch(props.search, props.onSearchChange);
  const keyword = search.q ?? "";
  const status = search.status ?? "all";
  const order = search.order ?? "desc";
  const page = search.page ?? 1;
  const pageSize = search.pageSize ?? 20;
  const keyQueryKey = ["api-keys", { keyword, order, page, pageSize, status }] as const;
  const keys = useQuery({
    queryKey: keyQueryKey,
    queryFn: () => repository.getApiKeysPage({ keyword, order, page, pageSize, status }),
  });
  const selectedKey =
    search.detail === undefined
      ? null
      : (keys.data?.items.find((apiKey) => apiKey.id === search.detail) ?? null);
  const createFormValid =
    form.name.trim().length > 0 &&
    form.name.trim().length <= 50 &&
    groupOptions.data?.some((option) => option.value === form.group) === true &&
    modelOptions.isSuccess &&
    (form.unlimitedQuota || (Number.isFinite(form.quotaUsd) && form.quotaUsd > 0));
  const hasListFilters = Boolean(keyword) || status !== "all";
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
      queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
    ]);
  const createKey = useMutation({
    mutationFn: () => repository.createApiKey(form),
    onSuccess: (result) => {
      setCreatedSecretCopied(false);
      setCreated(result);
      setCreateOpen(false);
      setForm(createInitialForm(props.defaultGroup));
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to create API key")),
    onSettled: createLock.release,
  });
  const toggleKey = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      repository.setApiKeyEnabled(id, enabled),
    onMutate: (variables) => {
      setTogglingKeyIds((current) => new Set(current).add(variables.id));
    },
    onSuccess: (result) => {
      queryClient.setQueryData<PaginatedResult<ApiKeyRecord>>(keyQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((apiKey) => (apiKey.id === result.id ? result : apiKey)),
            }
          : current,
      );
      toast.success(t("API key updated"));
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to update API key")),
    onSettled: (_data, _error, variables) => {
      toggleLock.release(variables.id);
      setTogglingKeyIds((current) => {
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
    },
  });
  const updateKey = useMutation({
    mutationFn: repository.updateApiKey,
    onSuccess: (result) => {
      queryClient.setQueryData<PaginatedResult<ApiKeyRecord>>(keyQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((apiKey) => (apiKey.id === result.id ? result : apiKey)),
            }
          : current,
      );
      setEditingKey(null);
      toast.success(t("API key settings updated"));
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to update API key")),
    onSettled: updateLock.release,
  });
  const revokeKey = useMutation({
    mutationFn: (id: number) => repository.revokeApiKey(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<PaginatedResult<ApiKeyRecord>>(keyQueryKey, (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((apiKey) => apiKey.id !== id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
      if (search.detail === id) updateSearch({ detail: undefined });
      toast.success(t("API key revoked"));
      void refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to revoke API key")),
    onSettled: revokeLock.release,
  });
  const locale = i18n.resolvedLanguage ?? "en";

  const copyCreatedSecret = async () => {
    if (!created?.secret) return;
    try {
      await copyText(created.secret);
      setCreatedSecretCopied(true);
      toast.success(t("API key copied"));
    } catch {
      toast.error(t("Unable to copy API key"));
    }
  };

  const createCurrentKey = () => {
    if (!createFormValid || !createLock.tryAcquire()) return;
    createKey.mutate();
  };

  const toggleCurrentKey = (id: number, enabled: boolean) => {
    if (!toggleLock.tryAcquire(id)) return;
    toggleKey.mutate({ id, enabled });
  };

  const updateCurrentKey = (input: UpdateApiKeyInput) => {
    if (!updateLock.tryAcquire()) return;
    updateKey.mutate(input);
  };

  const revokeCurrentKey = (id: number) => {
    if (!revokeLock.tryAcquire()) return;
    revokeKey.mutate(id);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("API keys")}
        description={t("Create and manage credentials for your applications.")}
        action={
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              if (!open && createKey.isPending) return;
              setCreateOpen(open);
            }}
          >
            <DialogTrigger render={<Button />}>
              <PlusIcon data-icon="inline-start" />
              {t("Create key")}
            </DialogTrigger>
            <DialogContent
              className="sm:max-w-2xl"
              closeLabel={t("Close")}
              showCloseButton={!createKey.isPending}
            >
              <DialogHeader>
                <DialogTitle>{t("Create API key")}</DialogTitle>
                <DialogDescription>
                  {t("The secret is shown once after creation.")}
                </DialogDescription>
              </DialogHeader>
              <FieldGroup>
                <Field data-invalid={form.name.trim().length > 50 || undefined}>
                  <FieldLabel htmlFor="key-name">{t("Name")}</FieldLabel>
                  <Input
                    aria-invalid={form.name.trim().length > 50 || undefined}
                    id="key-name"
                    maxLength={51}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder={t("Production application")}
                  />
                </Field>
                <div
                  className={
                    showEnvironment ? "grid gap-4 sm:grid-cols-3" : "grid gap-4 sm:grid-cols-2"
                  }
                >
                  {showEnvironment && (
                    <Field>
                      <FieldLabel id="key-environment">{t("Environment")}</FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          setForm({
                            ...form,
                            environment: value as CreateApiKeyInput["environment"],
                          })
                        }
                        value={form.environment}
                      >
                        <SelectTrigger aria-labelledby="key-environment" className="w-full">
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
                    <FieldLabel id="key-expires">{t("Expires")}</FieldLabel>
                    <ExpiryDateTimePicker
                      labelledBy="key-expires"
                      locale={locale}
                      onChange={(expiresAt) => setForm({ ...form, expiresAt })}
                      value={form.expiresAt}
                    />
                    <FieldDescription>
                      {t("The API key stops working at this exact local time.")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="key-group">{t("Group")}</FieldLabel>
                    <ApiKeyGroupSelect
                      error={groupOptions.isError}
                      id="key-group"
                      loading={groupOptions.isPending}
                      onRetry={() => void groupOptions.refetch()}
                      onValueChange={(group) => setForm({ ...form, group, allowedModels: [] })}
                      options={groupOptions.data ?? []}
                      value={form.group}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="key-models">{t("Allowed models")}</FieldLabel>
                    <ApiKeyModelSelect
                      error={modelOptions.isError}
                      id="key-models"
                      loading={
                        groupOptions.isPending || (form.group.length > 0 && modelOptions.isPending)
                      }
                      onRetry={() => void modelOptions.refetch()}
                      onValueChange={(allowedModels) => setForm({ ...form, allowedModels })}
                      options={modelOptions.data ?? []}
                      value={form.allowedModels}
                    />
                    <FieldDescription>
                      {t("Leave empty to allow every model in the account group.")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="key-ips">{t("Allowed IP ranges")}</FieldLabel>
                    <Input
                      id="key-ips"
                      onChange={(event) =>
                        setForm({
                          ...form,
                          allowedIps: event.target.value
                            .split(",")
                            .map((ip) => ip.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="203.0.113.0/24"
                      value={form.allowedIps.join(", ")}
                    />
                    <FieldDescription>
                      {t("Optional comma-separated IP addresses or CIDR ranges.")}
                    </FieldDescription>
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="unlimited-quota">
                    <Field>
                      <FieldLabel>{t("Unlimited quota")}</FieldLabel>
                      <FieldDescription>
                        {t("Use the account balance without a per-key limit.")}
                      </FieldDescription>
                    </Field>
                  </FieldLabel>
                  <Switch
                    id="unlimited-quota"
                    checked={form.unlimitedQuota}
                    onCheckedChange={(checked) => setForm({ ...form, unlimitedQuota: checked })}
                  />
                </Field>
                {!form.unlimitedQuota && (
                  <Field
                    data-invalid={!form.unlimitedQuota && form.quotaUsd <= 0 ? true : undefined}
                  >
                    <FieldLabel htmlFor="key-quota">{t("Key quota (USD)")}</FieldLabel>
                    <Input
                      aria-invalid={!form.unlimitedQuota && form.quotaUsd <= 0 ? true : undefined}
                      id="key-quota"
                      type="number"
                      min={0}
                      step="any"
                      value={form.quotaUsd}
                      onChange={(event) =>
                        setForm({ ...form, quotaUsd: Number(event.target.value) })
                      }
                    />
                  </Field>
                )}
              </FieldGroup>
              <DialogFooter>
                <Button
                  disabled={!createFormValid || createKey.isPending}
                  onClick={createCurrentKey}
                >
                  {createKey.isPending && (
                    <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                  )}
                  {t("Create key")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      {keys.data && search.detail !== undefined && !selectedKey ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("API key details unavailable")}</AlertTitle>
          <AlertDescription>
            {t(
              "The selected API key was not found in the current account, filters, or page. No substitute key was opened.",
            )}
          </AlertDescription>
          <AlertAction>
            <Button onClick={() => updateSearch({ detail: undefined })} size="sm" variant="outline">
              {t("Clear selection")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("Application credentials")}</CardTitle>
          <CardDescription>
            {t("Edit access settings, disable a key temporarily, or revoke it permanently.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const nextKeyword = String(formData.get("q") ?? "").trim();
              updateSearch({ detail: undefined, page: undefined, q: nextKeyword || undefined });
            }}
          >
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t("Search API keys")}
                defaultValue={keyword}
                key={keyword}
                name="q"
                placeholder={t("Search key name")}
              />
            </InputGroup>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const nextStatus = value as ApiKeyListInput["status"];
                updateSearch({
                  detail: undefined,
                  page: undefined,
                  status: nextStatus === "all" ? undefined : nextStatus,
                });
              }}
              value={status}
            >
              <SelectTrigger aria-label={t("API key status")} className="w-full">
                <SelectValue>{t(apiKeyStatusFilterLabel(status))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t("All statuses")}</SelectItem>
                  <SelectItem value="active">{t("Active")}</SelectItem>
                  <SelectItem value="disabled">{t("Disabled")}</SelectItem>
                  <SelectItem value="expired">{t("Expired")}</SelectItem>
                  <SelectItem value="exhausted">{t("Exhausted")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              onValueChange={(value) => {
                if (!value) return;
                const nextOrder = value as ApiKeyListInput["order"];
                updateSearch({
                  detail: undefined,
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
          {keys.isError ? (
            <DataLoadError
              description={t("Try refreshing the page or check the API connection.")}
              onRetry={() => void keys.refetch()}
              retrying={keys.isFetching}
              title={t("Unable to load API keys")}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Name")}</TableHead>
                      <TableHead>{t("Key")}</TableHead>
                      <TableHead>{t("Created")}</TableHead>
                      <TableHead>{t("Last used")}</TableHead>
                      <TableHead className="text-right">{t("Quota")}</TableHead>
                      <TableHead className="w-20">{t("Status")}</TableHead>
                      <TableHead className="w-24 text-right">{t("Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody aria-busy={keys.isPending}>
                    {keys.isPending ? <TableLoadingState colSpan={7} /> : null}
                    {!keys.isPending && (keys.data?.items.length ?? 0) === 0 ? (
                      <TableEmptyState
                        action={
                          <Button onClick={() => setCreateOpen(true)} size="sm">
                            <PlusIcon data-icon="inline-start" />
                            {t("Create key")}
                          </Button>
                        }
                        colSpan={7}
                        description={
                          hasListFilters
                            ? t("Try another name or status, or create a new key.")
                            : t("Create a key to authenticate your first application.")
                        }
                        title={hasListFilters ? t("No matching API keys") : t("No API keys yet")}
                      />
                    ) : null}
                    {keys.data?.items.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell>
                          <div className="flex max-w-64 items-center gap-1">
                            <Button
                              className="h-auto max-w-36 justify-start truncate p-0 text-left font-medium"
                              onClick={() => updateSearch({ detail: apiKey.id })}
                              title={apiKey.name}
                              variant="link"
                            >
                              {apiKey.name}
                            </Button>
                            {showEnvironment && (
                              <Badge variant="outline">
                                {t(environmentLabel(apiKey.environment))}
                              </Badge>
                            )}
                            <TableText
                              className="max-w-20 text-xs text-muted-foreground"
                              value={apiKey.group}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <TableText
                            className="max-w-44 font-mono text-xs"
                            value={apiKey.maskedKey}
                          />
                        </TableCell>
                        <TableCell>
                          <TableDateTime locale={locale} timestamp={apiKey.createdAt} />
                        </TableCell>
                        <TableCell>
                          <TableDateTime
                            fallback={t("Never")}
                            locale={locale}
                            timestamp={apiKey.lastUsedAt}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {apiKey.unlimitedQuota
                            ? t("Unlimited")
                            : formatCurrency(apiKey.remainingQuotaUsd, locale, "USD")}
                        </TableCell>
                        <TableCell>
                          {apiKey.status === "active" || apiKey.status === "disabled" ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Switch
                                    aria-label={t(
                                      apiKey.status === "active"
                                        ? "Disable API key"
                                        : "Enable API key",
                                    )}
                                    aria-busy={togglingKeyIds.has(apiKey.id)}
                                    checked={apiKey.status === "active"}
                                    disabled={togglingKeyIds.has(apiKey.id)}
                                    onCheckedChange={(checked) =>
                                      toggleCurrentKey(apiKey.id, checked)
                                    }
                                  />
                                }
                              />
                              <TooltipContent>
                                {t(apiKey.status === "active" ? "Enabled" : "Disabled")}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <ApiKeyStatusBadge status={apiKey.status} />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger
                                aria-label={t("Edit {{name}}", { name: apiKey.name })}
                                render={
                                  <Button
                                    onClick={() => {
                                      updateSearch({ detail: undefined });
                                      setEditingKey(apiKey);
                                    }}
                                    size="icon-sm"
                                    variant="ghost"
                                  />
                                }
                              >
                                <PencilIcon data-icon="inline-start" />
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("Edit {{name}}", { name: apiKey.name })}
                              </TooltipContent>
                            </Tooltip>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    aria-label={t("Revoke API key")}
                                    disabled={revokeKey.isPending}
                                    size="icon-sm"
                                    variant="ghost"
                                  />
                                }
                              >
                                <Trash2Icon data-icon="inline-start" />
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogMedia>
                                    <Trash2Icon />
                                  </AlertDialogMedia>
                                  <AlertDialogTitle>
                                    {t("Revoke {{name}}?", { name: apiKey.name })}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t(
                                      "Applications using this key will immediately lose access. This action cannot be undone.",
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel
                                    disabled={
                                      revokeKey.isPending && revokeKey.variables === apiKey.id
                                    }
                                  >
                                    {t("Cancel")}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    disabled={
                                      revokeKey.isPending && revokeKey.variables === apiKey.id
                                    }
                                    onClick={() => revokeCurrentKey(apiKey.id)}
                                    variant="destructive"
                                  >
                                    {revokeKey.isPending && revokeKey.variables === apiKey.id ? (
                                      <LoaderCircleIcon
                                        className="animate-spin"
                                        data-icon="inline-start"
                                      />
                                    ) : null}
                                    {t("Revoke")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {keys.isPending ? (
                <Skeleton className="h-8 w-full max-w-lg self-end" />
              ) : (
                <DataPagination
                  disabled={keys.isFetching}
                  onPageChange={(value) =>
                    updateSearch({
                      detail: undefined,
                      page: value === 1 ? undefined : value,
                    })
                  }
                  onPageSizeChange={(value) => {
                    updateSearch({
                      detail: undefined,
                      page: undefined,
                      pageSize: value === 20 ? undefined : value,
                    });
                  }}
                  page={keys.data?.page ?? page}
                  pageSize={keys.data?.pageSize ?? pageSize}
                  total={keys.data?.total ?? 0}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={Boolean(created)}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("Copy your API key")}</DialogTitle>
            <DialogDescription>
              {t("For security, this secret will not be shown again.")}
            </DialogDescription>
          </DialogHeader>
          <InputGroup>
            <InputGroupInput
              aria-label={t("API key")}
              className="font-mono text-xs"
              readOnly
              value={created?.secret ?? ""}
            />
            <InputGroupAddon align="inline-end">
              <Button
                aria-label={t(createdSecretCopied ? "API key copied" : "Copy API key")}
                onClick={() => void copyCreatedSecret()}
                size="icon-xs"
                variant="ghost"
              >
                {createdSecretCopied ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <ClipboardIcon data-icon="inline-start" />
                )}
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <DialogFooter>
            <Button
              onClick={() => {
                setCreated(null);
                setCreatedSecretCopied(false);
              }}
            >
              {t("I have saved it")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ApiKeyDetailsSheet
        apiKey={selectedKey}
        locale={locale}
        onEdit={(apiKey) => {
          setEditingKey(apiKey);
        }}
        onOpenChange={(open) => {
          if (!open) updateSearch({ detail: undefined });
        }}
        showEnvironment={showEnvironment}
      />
      {editingKey && (
        <ApiKeyEditDialog
          apiKey={editingKey}
          key={editingKey.id}
          locale={locale}
          onOpenChange={(open) => {
            if (open) return;
            setEditingKey(null);
          }}
          onSubmit={updateCurrentKey}
          pending={updateKey.isPending}
          showEnvironment={showEnvironment}
        />
      )}
    </div>
  );
}

function environmentLabel(environment: CreateApiKeyInput["environment"]): string {
  if (environment === "development") return "Development";
  if (environment === "staging") return "Staging";
  if (environment === "production") return "Production";
  return "Not recorded";
}

function apiKeyStatusFilterLabel(status: ApiKeyListInput["status"]): string {
  if (status === "active") return "Active";
  if (status === "disabled") return "Disabled";
  if (status === "expired") return "Expired";
  if (status === "exhausted") return "Exhausted";
  return "All statuses";
}
