import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  BotIcon,
  Code2Icon,
  HistoryIcon,
  KeyRoundIcon,
  LightbulbIcon,
  MessageSquareIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@token-boat/ui/components/ui/sheet";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { useSession } from "@/app/session/session-context";
import { PageHeader } from "@/components/page-header";
import type { PlaygroundConversation, PlaygroundStoredMessage } from "@/data/contracts";
import { repository } from "@/data/repository";
import { formatCurrency } from "@/lib/format";
import { CopilotPlaygroundChat } from "../components/copilot-playground-chat";
import { PlaygroundConversationList } from "../components/playground-conversation-list";
import { PlaygroundSettingsSheet } from "../components/playground-settings-sheet";
import { createPlaygroundConversationSync } from "../playground-conversation-sync";
import {
  createLocalPlaygroundConversation,
  deleteLocalPlaygroundConversation,
  listLocalPlaygroundConversations,
  saveLocalPlaygroundConversation,
} from "../playground-local-storage";

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
  const storageUserId = session?.user.id ?? null;
  const syncRef = useRef<ReturnType<typeof createPlaygroundConversationSync> | null>(null);
  const [apiKeyId, setApiKeyId] = useState<number | null>(null);
  const [model, setModel] = useState(initialModel);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatRevision, setChatRevision] = useState(0);
  const [conversationItems, setConversationItems] = useState<PlaygroundConversation[]>([]);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [conversationStorageError, setConversationStorageError] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(() => t("You are a helpful assistant."));
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => repository.listApiKeys() });
  const resolvedThreadId =
    activeThreadId ?? (initialModel ? null : (conversationItems[0]?.id ?? null));
  const activeConversation = conversationItems.find((item) => item.id === resolvedThreadId) ?? null;

  const refreshLocalConversations = useCallback(() => {
    if (!storageUserId) return;
    try {
      setConversationItems(listLocalPlaygroundConversations(storageUserId));
      setConversationStorageError(false);
    } catch {
      setConversationStorageError(true);
    } finally {
      setConversationLoading(false);
    }
  }, [storageUserId]);

  useEffect(() => {
    if (!storageUserId) {
      setConversationItems([]);
      setConversationLoading(false);
      return;
    }
    setConversationLoading(true);
    refreshLocalConversations();
  }, [refreshLocalConversations, storageUserId]);

  useEffect(() => {
    const sync = createPlaygroundConversationSync((changedThreadId) => {
      refreshLocalConversations();
      if (changedThreadId && changedThreadId === resolvedThreadId) {
        setChatRevision((revision) => revision + 1);
      }
    });
    syncRef.current = sync;
    return () => {
      sync.close();
      syncRef.current = null;
    };
  }, [refreshLocalConversations, resolvedThreadId]);

  useEffect(() => {
    if (!activeThreadId || conversationLoading) return;
    if (conversationItems.some((item) => item.id === activeThreadId)) return;
    setActiveThreadId(conversationItems[0]?.id ?? null);
  }, [activeThreadId, conversationItems, conversationLoading]);

  const activeKeys = (keys.data ?? []).filter((apiKey) => apiKey.status === "active");
  const preferredKey = initialModel
    ? activeKeys.find(
        (apiKey) =>
          apiKey.allowedModels.length === 0 || apiKey.allowedModels.includes(initialModel),
      )
    : null;
  const desiredApiKeyId = apiKeyId ?? activeConversation?.apiKeyId ?? null;
  const selectedKey =
    activeKeys.find((apiKey) => apiKey.id === desiredApiKeyId) ??
    preferredKey ??
    activeKeys[0] ??
    null;
  const selectedGroup = selectedKey?.group ?? null;
  const models = useQuery({
    queryKey: ["playground-models", selectedGroup],
    queryFn: () => repository.listPlaygroundModels(selectedGroup ?? ""),
    enabled: selectedGroup !== null,
  });
  const permittedModels = (models.data ?? []).filter(
    (item) => !selectedKey?.allowedModels.length || selectedKey.allowedModels.includes(item.id),
  );
  const desiredModel = model || activeConversation?.model || initialModel;
  const selectedModel =
    permittedModels.find((item) => item.id === desiredModel)?.id ?? permittedModels[0]?.id ?? "";

  const createConversation = () => {
    if (!selectedKey || !selectedModel) {
      toast.error(t("Select an API key and model first."));
      return;
    }
    if (!storageUserId) {
      toast.error(t("Unable to access local conversation history."));
      return;
    }
    try {
      const next = createLocalPlaygroundConversation(storageUserId, {
        apiKeyId: selectedKey.id,
        group: selectedKey.group,
        model: selectedModel,
      });
      setConversationItems(next);
      setConversationStorageError(false);
      setActiveThreadId(next[0]?.id ?? null);
      setHistoryOpen(false);
      syncRef.current?.publish();
    } catch {
      toast.error(t("Unable to access local conversation history."));
      setConversationStorageError(true);
    }
  };

  const deleteConversation = (id: string) => {
    if (!storageUserId || deletingConversationId) return;
    setDeletingConversationId(id);
    try {
      const remaining = deleteLocalPlaygroundConversation(storageUserId, id);
      setConversationItems(remaining);
      setConversationStorageError(false);
      if (resolvedThreadId === id) setActiveThreadId(remaining[0]?.id ?? null);
      syncRef.current?.publish();
    } catch {
      toast.error(t("Unable to access local conversation history."));
      setConversationStorageError(true);
    } finally {
      setDeletingConversationId(null);
    }
  };

  const selectConversation = (conversation: PlaygroundConversation) => {
    setActiveThreadId(conversation.id);
    setApiKeyId(conversation.apiKeyId);
    setModel(conversation.model);
    setHistoryOpen(false);
  };
  const handleConversationChanged = useCallback(
    (messages: PlaygroundStoredMessage[]) => {
      if (!resolvedThreadId || !storageUserId || !selectedKey || !selectedModel) return;
      try {
        const next = saveLocalPlaygroundConversation(
          storageUserId,
          resolvedThreadId,
          { apiKeyId: selectedKey.id, group: selectedKey.group, model: selectedModel },
          messages,
        );
        setConversationItems(next);
        setConversationStorageError(false);
        syncRef.current?.publish(resolvedThreadId);
      } catch {
        toast.error(t("Unable to access local conversation history."));
        setConversationStorageError(true);
      }
    },
    [resolvedThreadId, selectedKey, selectedModel, storageUserId, t],
  );
  const canCreate = Boolean(selectedKey && selectedModel && !keys.isPending && !models.isPending);
  const conversationList = (
    <PlaygroundConversationList
      activeId={resolvedThreadId}
      canCreate={canCreate}
      conversations={conversationItems}
      creating={false}
      deletingId={deletingConversationId}
      loading={conversationLoading}
      onCreate={createConversation}
      onDelete={deleteConversation}
      onSelect={selectConversation}
    />
  );

  const apiKeyItems = activeKeys.map((apiKey) => ({
    label: apiKey.name,
    value: String(apiKey.id),
  }));
  const modelItems = permittedModels.map((item) => ({ label: item.label, value: item.id }));

  return (
    <div className="flex min-h-[800px] flex-col gap-4 lg:h-[calc(100svh-7rem)] lg:min-h-[720px]">
      <PageHeader
        action={
          <div className="flex items-center gap-2">
            <Sheet onOpenChange={setHistoryOpen} open={historyOpen}>
              <SheetTrigger render={<Button className="xl:hidden" variant="outline" />}>
                <HistoryIcon data-icon="inline-start" />
                {t("History")}
              </SheetTrigger>
              <SheetContent className="w-[21rem] p-0" side="left">
                <SheetHeader className="sr-only">
                  <SheetTitle>{t("Conversation history")}</SheetTitle>
                  <SheetDescription>
                    {t("Open or remove conversations stored in this browser.")}
                  </SheetDescription>
                </SheetHeader>
                {conversationList}
              </SheetContent>
            </Sheet>
            <Button className="xl:hidden" disabled={!canCreate} onClick={createConversation}>
              <PlusIcon data-icon="inline-start" />
              {t("New chat")}
            </Button>
          </div>
        }
        description={t(
          "Compare permitted models in browser-local conversations using your existing API access.",
        )}
        title={t("Playground")}
      />

      <section className="flex min-h-[700px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm lg:min-h-[640px]">
        <aside
          aria-label={t("Conversation history")}
          className="hidden w-64 shrink-0 border-r bg-muted/15 xl:flex"
        >
          {conversationList}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            aria-label={t("Playground configuration")}
            className="flex flex-wrap items-end gap-3 border-b bg-background/85 p-3 backdrop-blur-xl sm:p-4"
            role="group"
          >
            <Field className="min-w-48 flex-1 gap-1.5 sm:max-w-64">
              <FieldLabel className="text-xs" htmlFor="playground-api-key">
                {t("API key")}
              </FieldLabel>
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
                    className="w-full bg-background"
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

            <Field className="min-w-48 flex-1 gap-1.5 sm:max-w-72">
              <FieldLabel className="text-xs" htmlFor="playground-model">
                {t("Model")}
              </FieldLabel>
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
                    className="w-full bg-background"
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

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:justify-end">
              {selectedKey ? (
                <>
                  {selectedKey.environment !== "unclassified" ? (
                    <Badge variant="outline">{t(environmentLabels[selectedKey.environment])}</Badge>
                  ) : null}
                  <Badge variant="secondary">
                    {selectedKey.unlimitedQuota
                      ? t("Unlimited quota")
                      : t("{{quota}} remaining", {
                          quota: formatCurrency(selectedKey.remainingQuotaUsd, locale, "USD"),
                        })}
                  </Badge>
                </>
              ) : null}
              <PlaygroundSettingsSheet
                maxTokens={maxTokens}
                onMaxTokensChange={setMaxTokens}
                onSystemPromptChange={setSystemPrompt}
                onTemperatureChange={setTemperature}
                systemPrompt={systemPrompt}
                temperature={temperature}
              />
            </div>
          </div>

          {(keys.isError || models.isError || conversationStorageError) && (
            <Alert className="m-4 w-auto" variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Unable to load Playground")}</AlertTitle>
              <AlertDescription>
                {t("Retry without changing the selected conversation or its settings.")}
              </AlertDescription>
              <AlertAction>
                <Button
                  disabled={keys.isFetching || models.isFetching}
                  onClick={() => {
                    if (keys.isError) void keys.refetch();
                    if (models.isError) void models.refetch();
                    if (conversationStorageError) refreshLocalConversations();
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
          ) : keys.isPending || models.isPending || conversationLoading || !selectedKey ? (
            <div className="flex flex-1 flex-col gap-4 p-6" role="status">
              <Skeleton className="mx-auto h-10 w-2/3 max-w-md" />
              <Skeleton className="mt-auto h-28 w-full" />
              <span className="sr-only">{t("Loading AI chat")}</span>
            </div>
          ) : !selectedModel ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <Alert className="max-w-xl">
                <SparklesIcon aria-hidden="true" />
                <AlertTitle>{t("No permitted models")}</AlertTitle>
                <AlertDescription>
                  {t("This API key does not currently have access to a model for Playground chat.")}
                </AlertDescription>
              </Alert>
            </div>
          ) : repository.mode === "demo" && resolvedThreadId ? (
            <PlaygroundDemoPreview model={selectedModel} />
          ) : resolvedThreadId ? (
            <CopilotPlaygroundChat
              apiKeyId={selectedKey.id}
              chatRevision={chatRevision}
              group={selectedKey.group}
              initialMessages={activeConversation?.messages ?? []}
              key={`${resolvedThreadId}:${chatRevision}`}
              maxTokens={maxTokens}
              model={selectedModel}
              onConversationChanged={handleConversationChanged}
              sessionToken={session?.accessToken}
              systemPrompt={systemPrompt}
              temperature={temperature}
              threadId={resolvedThreadId}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="max-w-md text-center">
                <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <MessageSquareIcon className="size-7" aria-hidden="true" />
                </span>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("Start a conversation")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(
                    "Choose the API key and model above. Messages are stored only in this browser and restored when you return.",
                  )}
                </p>
                <Button className="mt-5" disabled={!canCreate} onClick={createConversation}>
                  <PlusIcon data-icon="inline-start" />
                  {t("New chat")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PlaygroundDemoPreview({ model }: { model: string }) {
  const { t } = useTranslation();
  const prompts = [
    {
      description: t("Compare its reasoning, speed, and best-fit workloads."),
      icon: LightbulbIcon,
      title: t("Explore model capabilities"),
    },
    {
      description: t("Turn a product idea into clear implementation steps."),
      icon: BotIcon,
      title: t("Draft an implementation plan"),
    },
    {
      description: t("Check correctness, security, and maintainability."),
      icon: Code2Icon,
      title: t("Review code quality"),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-5 sm:p-8">
        <div className="w-full max-w-3xl">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_16px_40px_-18px_var(--color-primary)]">
            <SparklesIcon className="size-6" aria-hidden="true" />
          </span>
          <div className="mt-5 text-center">
            <Badge className="mb-3 font-mono" variant="outline">
              {model}
            </Badge>
            <h2 className="text-balance text-2xl font-semibold tracking-tight">
              {t("What would you like to explore?")}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              {t(
                "Start from a prompt below or open the live console to run the selected model with browser-local history.",
              )}
            </p>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {prompts.map((prompt) => {
              const Icon = prompt.icon;
              return (
                <div
                  className="rounded-xl border bg-background/80 p-4 shadow-sm transition-colors hover:border-primary/30"
                  key={prompt.title}
                >
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium">{prompt.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {prompt.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 bg-background/90 p-3 backdrop-blur-xl sm:p-4">
        <div className="mx-auto flex max-w-4xl items-end gap-3 rounded-2xl border bg-muted/25 p-3 shadow-sm">
          <div className="min-h-10 flex-1 px-1 py-2 text-sm text-muted-foreground">
            {t("Demo mode previews the interface without sending an AI request.")}
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ArrowUpIcon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {t("AI responses may contain errors. Verify important information.")}
        </p>
      </div>
    </div>
  );
}
