import { useEffect, useRef } from "react";
import {
  BotIcon,
  CopyIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@token-boat/ui/components/ui/message";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
import type { PlaygroundReply } from "@/data/contracts";
import { formatCurrency, formatNumber } from "@/lib/format";

export type PlaygroundConversationItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reply?: PlaygroundReply;
};

type PlaygroundChatProps = {
  canRetry: boolean;
  conversation: PlaygroundConversationItem[];
  generationError: string | null;
  isGenerating: boolean;
  locale: string;
  model: string;
  onRegenerate: () => void;
  onRetry: () => void;
  onSelectPrompt: (prompt: string) => void;
};

const promptSuggestions = [
  "Explain this API error and suggest a fix.",
  "Write a production-ready structured output example.",
  "Compare two implementation approaches with trade-offs.",
] as const;

export function PlaygroundChat({
  canRetry,
  conversation,
  generationError,
  isGenerating,
  locale,
  model,
  onRegenerate,
  onRetry,
  onSelectPrompt,
}: PlaygroundChatProps) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, isGenerating]);

  return (
    <ScrollArea className="min-h-0 flex-1 bg-gradient-to-b from-muted/15 to-background">
      <div aria-live="polite" className="mx-auto flex min-h-full w-full max-w-4xl px-4 py-4">
        {conversation.length === 0 ? (
          <Empty className="m-auto max-w-2xl py-4">
            <EmptyHeader>
              <EmptyMedia
                className="size-14 rounded-2xl bg-primary text-primary-foreground shadow-sm [&_svg]:size-6"
                variant="icon"
              >
                <BotIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-xl">{t("How can I help you?")}</EmptyTitle>
              <EmptyDescription className="max-w-lg text-pretty">
                {t(
                  "Test prompts with the selected API key's group and model permissions, then inspect output, tokens, latency, and estimated cost.",
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
              {promptSuggestions.map((prompt) => (
                <Button
                  className="h-auto justify-start whitespace-normal px-3 py-3 text-left leading-5"
                  key={prompt}
                  onClick={() => onSelectPrompt(t(prompt))}
                  variant="outline"
                >
                  {t(prompt)}
                </Button>
              ))}
            </EmptyContent>
          </Empty>
        ) : (
          <MessageGroup className="w-full gap-7">
            {conversation.map((item, index) => (
              <Message align={item.role === "user" ? "end" : "start"} key={item.id}>
                <MessageAvatar
                  className={
                    item.role === "user"
                      ? "bg-secondary text-secondary-foreground [&_svg]:size-4"
                      : "bg-primary text-primary-foreground [&_svg]:size-4"
                  }
                >
                  {item.role === "user" ? (
                    <UserRoundIcon aria-hidden="true" />
                  ) : (
                    <BotIcon aria-hidden="true" />
                  )}
                </MessageAvatar>
                <MessageContent
                  className={item.role === "user" ? "max-w-[min(82%,44rem)]" : "max-w-3xl"}
                >
                  <MessageHeader>
                    {item.role === "user"
                      ? t("You")
                      : item.reply
                        ? (item.reply.model ?? t("Model not returned"))
                        : model}
                  </MessageHeader>
                  <div
                    className={
                      item.role === "user"
                        ? "whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-3 leading-7 text-primary-foreground shadow-sm"
                        : "whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-card px-4 py-3 leading-7 shadow-xs"
                    }
                  >
                    {item.content}
                  </div>
                  <MessageFooter className="gap-3">
                    {item.reply && (
                      <>
                        {item.reply.inputTokens !== null && (
                          <span>
                            {t("Input")}: {formatNumber(item.reply.inputTokens, locale)}
                          </span>
                        )}
                        {item.reply.outputTokens !== null && (
                          <span>
                            {t("Output")}: {formatNumber(item.reply.outputTokens, locale)}
                          </span>
                        )}
                        <span>{formatNumber(item.reply.latencyMs, locale)} ms</span>
                        {item.reply.estimatedCost !== null && (
                          <span>{formatCurrency(item.reply.estimatedCost, locale)}</span>
                        )}
                      </>
                    )}
                    <Button
                      aria-label={t("Copy message")}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(item.content)
                          .then(() => toast.success(t("Message copied")))
                          .catch(() => toast.error(t("Unable to copy message")));
                      }}
                      size="icon-xs"
                      variant="ghost"
                    >
                      <CopyIcon />
                    </Button>
                    {item.role === "assistant" &&
                      index === conversation.length - 1 &&
                      !isGenerating && (
                        <Button onClick={onRegenerate} size="xs" variant="ghost">
                          <RotateCcwIcon data-icon="inline-start" />
                          {t("Regenerate response")}
                        </Button>
                      )}
                  </MessageFooter>
                </MessageContent>
              </Message>
            ))}
            {isGenerating && (
              <Message>
                <MessageAvatar className="bg-primary text-primary-foreground [&_svg]:size-4">
                  <BotIcon aria-hidden="true" />
                </MessageAvatar>
                <MessageContent className="max-w-3xl">
                  <MessageHeader>{model}</MessageHeader>
                  <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-muted-foreground shadow-xs">
                    <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
                    {t("Generating response…")}
                  </div>
                </MessageContent>
              </Message>
            )}
            {generationError && (
              <Alert className="ml-10 w-auto" variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t("Response generation failed")}</AlertTitle>
                <AlertDescription>{generationError}</AlertDescription>
                {canRetry && (
                  <AlertAction>
                    <Button onClick={onRetry} size="xs" variant="outline">
                      <RotateCcwIcon data-icon="inline-start" />
                      {t("Try again")}
                    </Button>
                  </AlertAction>
                )}
              </Alert>
            )}
          </MessageGroup>
        )}
        <div aria-hidden="true" ref={endRef} />
      </div>
    </ScrollArea>
  );
}
