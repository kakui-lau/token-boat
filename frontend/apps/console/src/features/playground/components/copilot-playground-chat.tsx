import { useCallback, useMemo } from "react";
import {
  CopilotChat,
  CopilotKit,
  useConfigureSuggestions,
  type CopilotChatLabels,
} from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const playgroundAgentId = "token-boat-playground";

type CopilotPlaygroundChatProps = {
  apiKeyId: number;
  group: string;
  maxTokens: number;
  model: string;
  resetKey: number;
  sessionToken?: string;
  systemPrompt: string;
  temperature: number;
};

export function CopilotPlaygroundChat(props: CopilotPlaygroundChatProps) {
  const { t } = useTranslation();
  const headers = useMemo<Record<string, string>>(() => {
    const nextHeaders: Record<string, string> = {};
    if (props.sessionToken) nextHeaders.Authorization = `Bearer ${props.sessionToken}`;
    return nextHeaders;
  }, [props.sessionToken]);
  const properties = useMemo(
    () => ({
      apiKeyId: props.apiKeyId,
      group: props.group,
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
      key={props.resetKey}
      onError={handleError}
      properties={properties}
      runtimeUrl="/pg/copilotkit"
      useSingleEndpoint={false}
    >
      <PlaygroundChatSurface />
    </CopilotKit>
  );
}

function PlaygroundChatSurface() {
  const { t } = useTranslation();
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

  return (
    <CopilotChat
      agentId={playgroundAgentId}
      autoScroll="pin-to-send"
      className="h-full min-h-0 bg-background text-foreground"
      input={{
        autoFocus: true,
        bottomAnchored: true,
        className: "border-t border-border/70 bg-background/95 backdrop-blur",
        showDisclaimer: true,
      }}
      labels={labels}
      messageView={{ className: "mx-auto w-full max-w-4xl px-3 sm:px-6" }}
      scrollView={{ className: "min-h-0 bg-background" }}
      suggestionView={{ className: "mx-auto w-full max-w-4xl px-3 sm:px-6" }}
      throttleMs={50}
    />
  );
}
