import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  CopilotChat,
  CopilotChatAssistantMessage,
  CopilotChatInput,
  CopilotChatSuggestionView,
  CopilotKit,
  useAgent,
  useConfigureSuggestions,
  type CopilotChatAssistantMessageProps,
  type CopilotChatLabels,
  type CopilotChatSuggestionViewProps,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { LoaderCircleIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { cn } from "@token-boat/ui/lib/utils";
import type { PlaygroundMessageMetrics, PlaygroundStoredMessage } from "@/data/contracts";
import { formatNumber } from "@/lib/format";

const playgroundAgentId = "token-boat-playground";

type CopilotPlaygroundChatProps = {
  apiKeyId: number;
  chatRevision: number;
  group: string;
  initialMessages: PlaygroundStoredMessage[];
  maxTokens: number;
  model: string;
  onConversationChanged(messages: PlaygroundStoredMessage[]): void;
  sessionToken?: string;
  systemPrompt: string;
  temperature: number;
  threadId: string;
};

export function CopilotPlaygroundChat(props: CopilotPlaygroundChatProps) {
  const { t } = useTranslation();
  const [initialMessagesSnapshot] = useState(() => props.initialMessages);
  const headers = useMemo<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = {};
    if (props.sessionToken) nextHeaders.Authorization = `Bearer ${props.sessionToken}`;
    return nextHeaders;
  }, [props.sessionToken]);
  const properties = useMemo(
    () => ({
      apiKeyId: props.apiKeyId,
      group: props.group,
      localMessages: initialMessagesSnapshot,
      maxTokens: props.maxTokens,
      model: props.model,
      systemPrompt: props.systemPrompt,
      temperature: props.temperature,
    }),
    [
      props.apiKeyId,
      props.group,
      props.maxTokens,
      props.model,
      props.systemPrompt,
      props.temperature,
      initialMessagesSnapshot,
    ],
  );
  const handleError = useCallback(
    (event: { error?: unknown }) => {
      const message = event.error instanceof Error ? event.error.message : "";
      toast.error(message || t("Unable to connect to the AI chat runtime."));
    },
    [t],
  );

  return (
    <CopilotKit
      credentials="same-origin"
      defaultThrottleMs={50}
      enableInspector={false}
      headers={headers}
      onError={handleError}
      properties={properties}
      runtimeUrl="/pg/copilotkit"
      useSingleEndpoint={false}
    >
      <PlaygroundChatSurface
        chatRevision={props.chatRevision}
        initialMessages={props.initialMessages}
        key={props.threadId}
        onConversationChanged={props.onConversationChanged}
        threadId={props.threadId}
      />
    </CopilotKit>
  );
}

function PlaygroundChatSurface({
  chatRevision,
  initialMessages,
  onConversationChanged,
  threadId,
}: {
  chatRevision: number;
  initialMessages: PlaygroundStoredMessage[];
  onConversationChanged(messages: PlaygroundStoredMessage[]): void;
  threadId: string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const { agent, isReady } = useAgent({ agentId: playgroundAgentId });
  const generationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistedMessagesRef = useRef(initialMessages);
  const runMetricsRef = useRef(new Map<string, PlaygroundMessageMetrics>());
  const [isGenerating, setIsGenerating] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMetrics, setRunMetrics] = useState<Record<string, PlaygroundMessageMetrics>>({});
  const storedMetrics = useMemo(
    () =>
      new Map(
        initialMessages.flatMap((message) =>
          message.metrics ? ([[message.id, message.metrics]] as const) : [],
        ),
      ),
    [initialMessages],
  );
  const labels = useMemo<Partial<CopilotChatLabels>>(
    () => ({
      assistantMessageToolbarCopyCodeCopiedLabel: t("Copied to clipboard"),
      assistantMessageToolbarCopyCodeLabel: t("Copy code"),
      assistantMessageToolbarCopyMessageLabel: t("Copy message"),
      assistantMessageToolbarRegenerateLabel: t("Regenerate response"),
      assistantMessageToolbarThumbsDownLabel: t("Not helpful"),
      assistantMessageToolbarThumbsUpLabel: t("Helpful"),
      chatDisclaimerText: t("AI responses may contain errors. Verify important information."),
      chatInputPlaceholder: t("Message the selected model…"),
      userMessageToolbarCopyMessageLabel: t("Copy message"),
      userMessageToolbarEditMessageLabel: t("Edit message"),
      welcomeMessageText: t("How can I help you?"),
    }),
    [t],
  );
  const suggestions = useMemo(
    () => [
      {
        message: t("Explain the strengths and limitations of this model."),
        title: t("Explore model capabilities"),
      },
      {
        message: t("Create a concise implementation plan for a production feature."),
        title: t("Draft an implementation plan"),
      },
      {
        message: t("Review a code snippet for correctness, security, and maintainability."),
        title: t("Review code quality"),
      },
    ],
    [t],
  );

  useConfigureSuggestions(
    {
      available: "before-first-message",
      consumerAgentId: playgroundAgentId,
      suggestions,
    },
    [suggestions],
  );

  useEffect(() => {
    if (!isReady) return;
    const readLocalMessages = (
      messages: ReadonlyArray<Readonly<(typeof agent.messages)[number]>>,
    ): PlaygroundStoredMessage[] =>
      messages.flatMap((message) => {
        if (
          (message.role !== "user" && message.role !== "assistant") ||
          typeof message.content !== "string"
        ) {
          return [];
        }
        const metrics = runMetricsRef.current.get(message.id) ?? storedMetrics.get(message.id);
        return [
          {
            id: message.id,
            role: message.role,
            content: message.content,
            ...(message.role === "assistant" && metrics ? { metrics } : {}),
          },
        ];
      });
    const stopGenerating = () => {
      if (generationTimerRef.current) clearTimeout(generationTimerRef.current);
      generationTimerRef.current = null;
      setIsGenerating(false);
    };
    const showRunError = (message: string) => {
      stopGenerating();
      const normalized = message.trim();
      setRunError(
        normalized && !normalized.toLowerCase().includes("upstream")
          ? normalized
          : t("Try again without leaving this page."),
      );
    };
    const persistLocalMessages = (
      messages: ReadonlyArray<Readonly<(typeof agent.messages)[number]>>,
    ) => {
      const nextMessages = readLocalMessages(messages);
      if (arePlaygroundMessagesEqual(lastPersistedMessagesRef.current, nextMessages)) return;
      lastPersistedMessagesRef.current = nextMessages;
      onConversationChanged(nextMessages);
    };
    const subscription = agent.subscribe({
      onRunFinalized: ({ messages }) => {
        stopGenerating();
        persistLocalMessages(messages);
      },
      onRunFinishedEvent: (event) => {
        stopGenerating();
        if (event.outcome !== "success") return;
        const metrics = readPlaygroundRunMetrics(event.result);
        if (!metrics) return;
        runMetricsRef.current.set(metrics.messageId, metrics.values);
        setRunMetrics((current) => ({ ...current, [metrics.messageId]: metrics.values }));
      },
      onRunInitialized: ({ messages }) => {
        const shouldRestoreHistory = messages.length === 0 && initialMessages.length > 0;
        const isUserRun =
          !shouldRestoreHistory &&
          !arePlaygroundMessagesEqual(
            lastPersistedMessagesRef.current,
            readLocalMessages(messages),
          );
        if (isUserRun) {
          setRunError(null);
          if (generationTimerRef.current) clearTimeout(generationTimerRef.current);
          generationTimerRef.current = setTimeout(() => setIsGenerating(true), 250);
        }
        if (!shouldRestoreHistory) return;
        return {
          messages: initialMessages.map(({ content, id, role }) => ({ content, id, role })),
        };
      },
      onRunErrorEvent: ({ event }) => showRunError(event.message),
      onRunFailed: ({ error }) => showRunError(error.message),
      onTextMessageStartEvent: stopGenerating,
    });
    return () => {
      if (generationTimerRef.current) clearTimeout(generationTimerRef.current);
      generationTimerRef.current = null;
      subscription.unsubscribe();
    };
  }, [agent, initialMessages, isReady, onConversationChanged, storedMetrics, t]);

  const AssistantMessage = useMemo(
    () =>
      Object.assign(function PlaygroundAssistantMessage(
        messageProps: CopilotChatAssistantMessageProps,
      ) {
        const metrics =
          runMetrics[messageProps.message.id] ?? storedMetrics.get(messageProps.message.id);
        return (
          <CopilotChatAssistantMessage
            {...messageProps}
            additionalToolbarItems={
              <>
                {metrics ? <PlaygroundAssistantMetrics locale={locale} metrics={metrics} /> : null}
                {messageProps.additionalToolbarItems}
              </>
            }
          />
        );
      }, CopilotChatAssistantMessage),
    [locale, runMetrics, storedMetrics],
  );

  const TrackedChatInput = useMemo(
    () =>
      Object.assign(function TrackedPlaygroundChatInput(
        inputProps: ComponentProps<typeof CopilotChatInput>,
      ) {
        return (
          <CopilotChatInput
            {...inputProps}
            bottomAnchored
            className="border-t border-border/60 bg-background/90 px-2 py-3 backdrop-blur-xl sm:px-4"
            onSubmitMessage={(value) => {
              if (!inputProps.onSubmitMessage) return;
              inputProps.onSubmitMessage(value);
            }}
            showDisclaimer
          />
        );
      }, CopilotChatInput),
    [],
  );
  const SuggestionView = useMemo(
    () =>
      Object.assign(function PlaygroundSuggestionView(
        suggestionProps: CopilotChatSuggestionViewProps,
      ) {
        return (
          <Empty className="min-h-[clamp(30rem,60svh,44rem)] rounded-none border-0 px-6 py-10">
            <EmptyHeader className="max-w-lg">
              <EmptyMedia
                className="size-12 rounded-2xl bg-primary/10 text-primary [&_svg]:size-5"
                variant="icon"
              >
                <SparklesIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-lg">{t("How can I help you?")}</EmptyTitle>
              <EmptyDescription>
                {t(
                  "Test prompts with the selected API key's group and model permissions, then inspect output, tokens, latency, and estimated cost.",
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-2xl">
              <CopilotChatSuggestionView
                {...suggestionProps}
                className={cn("w-full justify-center", suggestionProps.className)}
              />
            </EmptyContent>
          </Empty>
        );
      }, CopilotChatSuggestionView),
    [t],
  );

  return (
    <div className="relative h-full min-h-0">
      <CopilotChat
        agentId={playgroundAgentId}
        autoScroll="pin-to-send"
        className="h-full min-h-0 !bg-transparent text-foreground"
        input={TrackedChatInput}
        labels={labels}
        key={`${threadId}:${chatRevision}`}
        messageView={{
          assistantMessage: AssistantMessage,
          className: "mx-auto w-full max-w-3xl px-3 py-4 sm:px-6",
          userMessage: {
            branchNavigation: () => null,
            copyButton: () => null,
            editButton: () => null,
          },
        }}
        scrollView={{ className: "min-h-0 !bg-transparent" }}
        suggestionView={SuggestionView}
        threadId={threadId}
        throttleMs={50}
      />
      {isGenerating || runError ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-24 flex justify-center sm:bottom-28">
          {runError ? (
            <Alert className="pointer-events-auto max-w-3xl shadow-sm" variant="destructive">
              <TriangleAlertIcon aria-hidden="true" />
              <AlertTitle>{t("Request failed")}</AlertTitle>
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          ) : (
            <Badge className="gap-2 px-3 py-2 shadow-sm" role="status" variant="secondary">
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              {t("Generating response…")}
            </Badge>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PlaygroundAssistantMetrics({
  locale,
  metrics,
}: {
  locale: string;
  metrics: PlaygroundMessageMetrics;
}) {
  const { t } = useTranslation();
  return (
    <span className="order-first mr-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="max-w-48 truncate font-medium" title={metrics.model}>
        {metrics.model}
      </span>
      {metrics.inputTokens !== undefined ? (
        <span>
          {t("Input")}: {formatNumber(metrics.inputTokens, locale)}
        </span>
      ) : null}
      {metrics.outputTokens !== undefined ? (
        <span>
          {t("Output")}: {formatNumber(metrics.outputTokens, locale)}
        </span>
      ) : null}
      <span>{formatNumber(metrics.latencyMs, locale)} ms</span>
    </span>
  );
}

function readPlaygroundRunMetrics(
  value: unknown,
): { messageId: string; values: PlaygroundMessageMetrics } | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (
    typeof result.messageId !== "string" ||
    !result.messageId ||
    typeof result.model !== "string" ||
    !result.model ||
    typeof result.latencyMs !== "number" ||
    !Number.isFinite(result.latencyMs) ||
    result.latencyMs < 0
  ) {
    return null;
  }
  const inputTokens = readTokenCount(result.inputTokens);
  const outputTokens = readTokenCount(result.outputTokens);
  return {
    messageId: result.messageId,
    values: {
      model: result.model,
      latencyMs: result.latencyMs,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
    },
  };
}

function readTokenCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function arePlaygroundMessagesEqual(
  left: PlaygroundStoredMessage[],
  right: PlaygroundStoredMessage[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((message, index) => {
    const other = right[index];
    if (!other) return false;
    return (
      message.id === other.id &&
      message.role === other.role &&
      message.content === other.content &&
      message.metrics?.model === other.metrics?.model &&
      message.metrics?.inputTokens === other.metrics?.inputTokens &&
      message.metrics?.outputTokens === other.metrics?.outputTokens &&
      message.metrics?.latencyMs === other.metrics?.latencyMs
    );
  });
}
