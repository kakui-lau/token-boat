import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  KeyRoundIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import { Field, FieldLabel } from "@token-boat/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { useSession } from "@/app/session/session-context";
import { PageHeader } from "@/components/page-header";
import { repository } from "@/data/repository";
import { formatNumber } from "@/lib/format";
import { CopilotPlaygroundChat } from "../components/copilot-playground-chat";
import { PlaygroundSettingsSheet } from "../components/playground-settings-sheet";

const environmentLabels = {
  development: "Development",
  staging: "Staging",
  production: "Production",
  unclassified: "Not recorded",
} as const;

export function PlaygroundPage({ initialModel = "" }: { initialModel?: string }) {
  const { t, i18n } = useTranslation();
  const { session } = useSession();
  const locale = i18n.resolvedLanguage ?? "en";
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => repository.listApiKeys() });
  const [apiKeyId, setApiKeyId] = useState<number | null>(null);
  const [model, setModel] = useState(initialModel);
  const [systemPrompt, setSystemPrompt] = useState(() => t("You are a helpful assistant."));
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [chatResetKey, setChatResetKey] = useState(0);

  const activeKeys = (keys.data ?? []).filter((apiKey) => apiKey.status === "active");
  const preferredKey = initialModel
    ? activeKeys.find(
        (apiKey) =>
          apiKey.allowedModels.length === 0 || apiKey.allowedModels.includes(initialModel),
      )
    : null;
  const selectedKey =
    activeKeys.find((apiKey) => apiKey.id === apiKeyId) ?? preferredKey ?? activeKeys[0] ?? null;
  const selectedGroup = selectedKey?.group ?? null;
  const models = useQuery({
    queryKey: ["playground-models", selectedGroup],
    queryFn: () => repository.listPlaygroundModels(selectedGroup ?? ""),
    enabled: selectedGroup !== null,
  });
  const permittedModels = (models.data ?? []).filter(
    (item) => !selectedKey?.allowedModels.length || selectedKey.allowedModels.includes(item.id),
  );
  const selectedModel =
    permittedModels.find((item) => item.id === model)?.id ?? permittedModels[0]?.id ?? "";

  const startNewChat = () => {
    setChatResetKey((current) => current + 1);
  };

  const apiKeyItems = activeKeys.map((apiKey) => ({
    label: apiKey.name,
    value: String(apiKey.id),
  }));
  const modelItems = permittedModels.map((item) => ({ label: item.label, value: item.id }));
  return (
    <div className="flex min-h-[744px] flex-col gap-6 lg:h-[calc(100svh-7rem)] lg:min-h-[640px]">
      <PageHeader
        action={
          <Button onClick={startNewChat} variant="outline">
            <PlusIcon data-icon="inline-start" />
            {t("New chat")}
          </Button>
        }
        description={t(
          "Test conversations using the selected API key's group and model permissions.",
        )}
        title={t("Playground")}
      />

      <section className="flex min-h-[640px] flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:min-h-0">
        <div className="grid min-h-0 flex-1 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]">
          <aside
            aria-label={t("Playground configuration")}
            className="flex flex-col border-b bg-muted/20 md:border-r md:border-b-0"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-2 md:grid-cols-1">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="playground-api-key">{t("API key")}</FieldLabel>
                {keys.isPending ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <Select
                    disabled={activeKeys.length === 0}
                    items={apiKeyItems}
                    onValueChange={(value) => {
                      if (!value) return;
                      setApiKeyId(Number(value));
                      setModel("");
                    }}
                    value={selectedKey ? String(selectedKey.id) : null}
                  >
                    <SelectTrigger
                      aria-label={t("Select API key")}
                      className="w-full"
                      id="playground-api-key"
                    >
                      <KeyRoundIcon aria-hidden="true" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectLabel>{t("Active API keys")}</SelectLabel>
                        {activeKeys.map((apiKey) => (
                          <SelectItem key={apiKey.id} value={String(apiKey.id)}>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{apiKey.name}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {apiKey.maskedKey}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <Field className="gap-1.5">
                <FieldLabel htmlFor="playground-model">{t("Model")}</FieldLabel>
                {models.isPending ? (
                  <Skeleton className="h-8 w-full" />
                ) : (
                  <Select
                    disabled={modelItems.length === 0}
                    items={modelItems}
                    onValueChange={(value) => value && setModel(value)}
                    value={selectedModel || null}
                  >
                    <SelectTrigger
                      aria-label={t("Select a model")}
                      className="w-full"
                      id="playground-model"
                    >
                      <SparklesIcon aria-hidden="true" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectLabel>{t("Available models")}</SelectLabel>
                        {permittedModels.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <div className="flex flex-col gap-3 sm:col-span-2 md:col-span-1">
                {selectedKey && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background/70 p-3">
                    {selectedKey.environment !== "unclassified" && (
                      <Badge variant="outline">
                        {t(environmentLabels[selectedKey.environment])}
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {t("Group")}: {selectedKey.group}
                    </Badge>
                    <span className="w-full text-xs text-muted-foreground">
                      {selectedKey.unlimitedQuota
                        ? t("Unlimited quota")
                        : t("{{quota}} quota remaining", {
                            quota: formatNumber(selectedKey.remainingQuota, locale),
                          })}
                    </span>
                  </div>
                )}
                <PlaygroundSettingsSheet
                  maxTokens={maxTokens}
                  onMaxTokensChange={setMaxTokens}
                  onSystemPromptChange={setSystemPrompt}
                  onTemperatureChange={setTemperature}
                  systemPrompt={systemPrompt}
                  temperature={temperature}
                  triggerClassName="w-full"
                />
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-col">
            {(keys.isError || models.isError) && (
              <Alert className="m-4 w-auto" variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t("Unable to load Playground configuration")}</AlertTitle>
                <AlertDescription>
                  {t("Retry without leaving the current conversation or changing its settings.")}
                </AlertDescription>
                <AlertAction>
                  <Button
                    disabled={keys.isFetching || models.isFetching}
                    onClick={() => {
                      if (keys.isError) void keys.refetch();
                      if (models.isError) void models.refetch();
                    }}
                    size="xs"
                    variant="outline"
                  >
                    {keys.isFetching || models.isFetching ? t("Retrying…") : t("Try again")}
                  </Button>
                </AlertAction>
              </Alert>
            )}

            {!keys.isPending && activeKeys.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <Alert className="max-w-xl">
                  <ShieldCheckIcon aria-hidden="true" />
                  <AlertTitle>{t("An active API key is required")}</AlertTitle>
                  <AlertDescription>
                    {t("Create or enable an API key before starting a Playground conversation.")}{" "}
                    <Link className="font-medium" to="/api-keys">
                      {t("Manage API keys")}
                    </Link>
                  </AlertDescription>
                </Alert>
              </div>
            ) : models.isPending || !selectedKey ? (
              <div className="flex flex-1 flex-col gap-4 p-6" role="status">
                <Skeleton className="mx-auto h-10 w-2/3 max-w-md" />
                <Skeleton className="mt-auto h-28 w-full" />
                <span className="sr-only">{t("Loading AI chat")}</span>
              </div>
            ) : selectedModel ? (
              <CopilotPlaygroundChat
                apiKeyId={selectedKey.id}
                group={selectedKey.group}
                maxTokens={maxTokens}
                model={selectedModel}
                resetKey={chatResetKey}
                sessionToken={session?.accessToken}
                systemPrompt={systemPrompt}
                temperature={temperature}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <Alert className="max-w-xl">
                  <SparklesIcon aria-hidden="true" />
                  <AlertTitle>{t("No permitted models")}</AlertTitle>
                  <AlertDescription>
                    {t(
                      "This API key does not currently have access to a model for Playground chat.",
                    )}
                  </AlertDescription>
                </Alert>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
