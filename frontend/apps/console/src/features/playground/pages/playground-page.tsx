import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpIcon,
  BotIcon,
  Code2Icon,
  HistoryIcon,
  LightbulbIcon,
  ImageIcon,
  MessageSquareIcon,
  PlusIcon,
  SparklesIcon,
  TriangleAlertIcon,
  VideoIcon,
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
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import { useSession } from "@/app/session/session-context";
import { PageHeader } from "@/components/page-header";
import type {
  PlaygroundConversation,
  PlaygroundMode,
  PlaygroundStoredMessage,
} from "@/data/contracts";
import { repository } from "@/data/repository";
import { PlaygroundConversationList } from "../components/playground-conversation-list";
import { PlaygroundSettingsSheet } from "../components/playground-settings-sheet";
import { createPlaygroundConversationSync } from "../playground-conversation-sync";
import { getPlaygroundModelModes } from "../playground-model-capabilities";
import {
  createLocalPlaygroundConversation,
  deleteLocalPlaygroundConversation,
  listLocalPlaygroundConversations,
  saveLocalPlaygroundConversation,
} from "../playground-local-storage";

const loadCopilotPlaygroundChat = () =>
  import("../components/copilot-playground-chat").then((module) => ({
    default: module.CopilotPlaygroundChat,
  }));
const CopilotPlaygroundChat = lazy(loadCopilotPlaygroundChat);
const preloadCopilotPlaygroundChat = () => void loadCopilotPlaygroundChat();
const loadPlaygroundMediaGenerator = () =>
  import("../components/playground-media-generator").then((module) => ({
    default: module.PlaygroundMediaGenerator,
  }));
const PlaygroundMediaGenerator = lazy(loadPlaygroundMediaGenerator);
const preloadPlaygroundMediaGenerator = () => void loadPlaygroundMediaGenerator();

export function PlaygroundPage({ initialModel = "" }: { initialModel?: string }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const storageUserId = session?.user.id ?? null;
  const selectedGroup = session?.user.group.trim() || null;
  const syncRef = useRef<ReturnType<typeof createPlaygroundConversationSync> | null>(null);
  const [model, setModel] = useState(initialModel);
  const [mode, setMode] = useState<PlaygroundMode>("chat");
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

  const models = useQuery({
    queryKey: ["playground-models", selectedGroup],
    queryFn: () => repository.listPlaygroundModels(selectedGroup ?? ""),
    enabled: selectedGroup !== null,
  });
  const permittedModels = models.data ?? [];
  const desiredModel = model || activeConversation?.model || initialModel;
  const desiredModelRecord = permittedModels.find((item) => item.id === desiredModel);
  const availableModes = (["chat", "image", "video"] as const).filter((candidate) =>
    permittedModels.some((item) => getPlaygroundModelModes(item).includes(candidate)),
  );
  const activeMode =
    desiredModelRecord && !getPlaygroundModelModes(desiredModelRecord).includes(mode)
      ? (getPlaygroundModelModes(desiredModelRecord)[0] ?? mode)
      : permittedModels.some((item) => getPlaygroundModelModes(item).includes(mode))
        ? mode
        : (availableModes[0] ?? mode);
  const modelsForMode = permittedModels.filter((item) =>
    getPlaygroundModelModes(item).includes(activeMode),
  );
  const selectedModel =
    modelsForMode.find((item) => item.id === desiredModel)?.id ?? modelsForMode[0]?.id ?? "";

  const createConversation = () => {
    if (!selectedModel) {
      toast.error(t("Select a model first."));
      return;
    }
    if (!storageUserId) {
      toast.error(t("Unable to access local conversation history."));
      return;
    }
    try {
      const next = createLocalPlaygroundConversation(storageUserId, {
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
    setMode("chat");
    setActiveThreadId(conversation.id);
    setModel(conversation.model);
    setHistoryOpen(false);
  };
  const handleConversationChanged = useCallback(
    (messages: PlaygroundStoredMessage[]) => {
      if (!resolvedThreadId || !storageUserId || !selectedModel) return;
      try {
        const next = saveLocalPlaygroundConversation(
          storageUserId,
          resolvedThreadId,
          { model: selectedModel },
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
    [resolvedThreadId, selectedModel, storageUserId, t],
  );
  const canCreate = Boolean(
    activeMode === "chat" && selectedGroup && selectedModel && !models.isPending,
  );
  const conversationList = (
    <PlaygroundConversationList
      activeId={resolvedThreadId}
      canCreate={canCreate}
      conversations={conversationItems}
      creating={false}
      deletingId={deletingConversationId}
      loading={conversationLoading}
      onCreate={createConversation}
      onCreateIntent={preloadCopilotPlaygroundChat}
      onDelete={deleteConversation}
      onSelect={selectConversation}
    />
  );

  const modelItems = modelsForMode.map((item) => ({ label: item.label, value: item.id }));
  const changeMode = (nextMode: PlaygroundMode) => {
    setMode(nextMode);
    const currentModel = permittedModels.find((item) => item.id === selectedModel);
    if (!currentModel || !getPlaygroundModelModes(currentModel).includes(nextMode)) {
      setModel(
        permittedModels.find((item) => getPlaygroundModelModes(item).includes(nextMode))?.id ?? "",
      );
    }
  };

  return (
    <div className="flex min-h-[800px] flex-col gap-4 lg:h-[calc(100svh-7rem)] lg:min-h-[720px]">
      <PageHeader
        action={
          activeMode === "chat" ? (
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
              <Button
                className="xl:hidden"
                disabled={!canCreate}
                onClick={createConversation}
                onFocus={preloadCopilotPlaygroundChat}
                onPointerEnter={preloadCopilotPlaygroundChat}
              >
                <PlusIcon data-icon="inline-start" />
                {t("New chat")}
              </Button>
            </div>
          ) : null
        }
        description={t(
          "Test permitted chat, image, and video models with your current account pricing.",
        )}
        title={t("Playground")}
      />

      <section className="flex min-h-[700px] flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm lg:min-h-[640px]">
        {activeMode === "chat" ? (
          <aside
            aria-label={t("Conversation history")}
            className="hidden w-64 shrink-0 border-r bg-muted/15 xl:flex"
          >
            {conversationList}
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            aria-label={t("Playground configuration")}
            className="flex flex-wrap items-end gap-3 border-b bg-background/85 p-3 backdrop-blur-xl sm:p-4"
            role="group"
          >
            <Field className="gap-1.5">
              <FieldLabel id="playground-mode">{t("Mode")}</FieldLabel>
              <ToggleGroup
                aria-labelledby="playground-mode"
                onValueChange={(values) => {
                  const nextMode = values[0] as PlaygroundMode | undefined;
                  if (nextMode) changeMode(nextMode);
                }}
                spacing={0}
                value={[activeMode]}
                variant="outline"
              >
                {availableModes.includes("chat") ? (
                  <ToggleGroupItem value="chat">
                    <MessageSquareIcon data-icon="inline-start" />
                    {t("Chat")}
                  </ToggleGroupItem>
                ) : null}
                {availableModes.includes("image") ? (
                  <ToggleGroupItem
                    onFocus={preloadPlaygroundMediaGenerator}
                    onPointerEnter={preloadPlaygroundMediaGenerator}
                    value="image"
                  >
                    <ImageIcon data-icon="inline-start" />
                    {t("Image")}
                  </ToggleGroupItem>
                ) : null}
                {availableModes.includes("video") ? (
                  <ToggleGroupItem
                    onFocus={preloadPlaygroundMediaGenerator}
                    onPointerEnter={preloadPlaygroundMediaGenerator}
                    value="video"
                  >
                    <VideoIcon data-icon="inline-start" />
                    {t("Video")}
                  </ToggleGroupItem>
                ) : null}
              </ToggleGroup>
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
                      {modelsForMode.map((item) => (
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
              {activeMode === "chat" ? (
                <PlaygroundSettingsSheet
                  maxTokens={maxTokens}
                  onMaxTokensChange={setMaxTokens}
                  onSystemPromptChange={setSystemPrompt}
                  onTemperatureChange={setTemperature}
                  systemPrompt={systemPrompt}
                  temperature={temperature}
                />
              ) : null}
            </div>
          </div>

          {(models.isError || conversationStorageError) && (
            <Alert className="m-4 w-auto" variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Unable to load Playground")}</AlertTitle>
              <AlertDescription>
                {t("Retry without changing the selected conversation or its settings.")}
              </AlertDescription>
              <AlertAction>
                <Button
                  disabled={models.isFetching}
                  onClick={() => {
                    if (models.isError) void models.refetch();
                    if (conversationStorageError) refreshLocalConversations();
                  }}
                  size="xs"
                  variant="outline"
                >
                  {models.isFetching ? t("Retrying…") : t("Try again")}
                </Button>
              </AlertAction>
            </Alert>
          )}

          {models.isPending || conversationLoading || !selectedGroup ? (
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
                  {t(
                    "Your current group does not have a model available for this Playground mode.",
                  )}
                </AlertDescription>
              </Alert>
            </div>
          ) : activeMode !== "chat" ? (
            <Suspense fallback={<PlaygroundMediaLoading />}>
              <PlaygroundMediaGenerator
                group={selectedGroup}
                key={`${activeMode}:${selectedModel}`}
                mode={activeMode}
                model={selectedModel}
              />
            </Suspense>
          ) : repository.mode === "demo" && resolvedThreadId ? (
            <PlaygroundDemoPreview model={selectedModel} />
          ) : resolvedThreadId ? (
            <Suspense fallback={<PlaygroundChatLoading />}>
              <CopilotPlaygroundChat
                chatRevision={chatRevision}
                group={selectedGroup}
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
            </Suspense>
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
                    "Choose a model above. Messages are stored only in this browser and restored when you return.",
                  )}
                </p>
                <Button
                  className="mt-5"
                  disabled={!canCreate}
                  onClick={createConversation}
                  onFocus={preloadCopilotPlaygroundChat}
                  onPointerEnter={preloadCopilotPlaygroundChat}
                >
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

function PlaygroundMediaLoading() {
  const { t } = useTranslation();
  return (
    <div className="grid flex-1 gap-5 p-6 lg:grid-cols-2" role="status">
      <Skeleton className="h-[32rem] w-full" />
      <Skeleton className="h-[32rem] w-full" />
      <span className="sr-only">{t("Loading media generator")}</span>
    </div>
  );
}

function PlaygroundChatLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" role="status">
      <Skeleton className="mx-auto h-10 w-2/3 max-w-md" />
      <Skeleton className="mt-auto h-28 w-full" />
      <span className="sr-only">{t("Loading AI chat")}</span>
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
