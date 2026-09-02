import type { FormEvent, KeyboardEvent } from "react";
import { CornerDownLeftIcon, SendIcon, SquareIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@token-boat/ui/components/ui/input-group";
import { Kbd, KbdGroup } from "@token-boat/ui/components/ui/kbd";

type PlaygroundComposerProps = {
  disabled: boolean;
  isGenerating: boolean;
  message: string;
  model: string;
  onMessageChange: (value: string) => void;
  onStop: () => void;
  onSubmit: () => void;
};

export function PlaygroundComposer({
  disabled,
  isGenerating,
  message,
  model,
  onMessageChange,
  onStop,
  onSubmit,
}: PlaygroundComposerProps) {
  const { t } = useTranslation();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <form className="mx-auto w-full max-w-4xl" onSubmit={submit}>
      <InputGroup className="min-h-20 overflow-hidden rounded-xl bg-background shadow-[0_18px_60px_-32px_rgba(0,0,0,0.55)] ring-1 ring-foreground/5 transition-shadow focus-within:shadow-[0_22px_70px_-34px_rgba(0,0,0,0.7)]">
        <InputGroupTextarea
          aria-label={t("Message")}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="max-h-36 min-h-10 px-3.5 pt-2.5 text-sm leading-6"
          disabled={disabled}
          onChange={(event) => onMessageChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("Message the model…")}
          rows={2}
          spellCheck={false}
          value={message}
        />
        <InputGroupAddon
          align="block-end"
          className="justify-between gap-3 bg-muted/20 px-2.5 pb-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge className="max-w-40 truncate" variant="secondary">
              {model || t("Select a model")}
            </Badge>
            <KbdGroup className="hidden 2xl:inline-flex">
              <Kbd>{t("Enter")}</Kbd>
              <span className="text-xs text-muted-foreground">{t("to send")}</span>
              <Kbd>{t("Shift")}</Kbd>
              <span className="text-xs text-muted-foreground">+</span>
              <Kbd>
                <CornerDownLeftIcon aria-hidden="true" />
              </Kbd>
              <span className="text-xs text-muted-foreground">{t("for a new line")}</span>
            </KbdGroup>
          </div>
          {isGenerating ? (
            <Button onClick={onStop} type="button" variant="secondary">
              <SquareIcon data-icon="inline-start" />
              {t("Stop")}
            </Button>
          ) : (
            <Button disabled={disabled || !message.trim()} type="submit">
              <SendIcon data-icon="inline-start" />
              {t("Send")}
            </Button>
          )}
        </InputGroupAddon>
      </InputGroup>
      <p className="mt-1.5 text-center text-xs text-muted-foreground">
        {t("Playground responses may be inaccurate. Verify important outputs before use.")}
      </p>
    </form>
  );
}
