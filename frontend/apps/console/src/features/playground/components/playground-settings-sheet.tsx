import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@token-boat/ui/components/ui/sheet";
import { Slider } from "@token-boat/ui/components/ui/slider";
import { Textarea } from "@token-boat/ui/components/ui/textarea";

type PlaygroundSettingsSheetProps = {
  maxTokens: number;
  onMaxTokensChange: (value: number) => void;
  onSystemPromptChange: (value: string) => void;
  onTemperatureChange: (value: number) => void;
  systemPrompt: string;
  temperature: number;
  triggerClassName?: string;
};

export function PlaygroundSettingsSheet({
  maxTokens,
  onMaxTokensChange,
  onSystemPromptChange,
  onTemperatureChange,
  systemPrompt,
  temperature,
  triggerClassName,
}: PlaygroundSettingsSheetProps) {
  const { t } = useTranslation();

  return (
    <Sheet>
      <SheetTrigger render={<Button className={triggerClassName} variant="outline" />}>
        <SlidersHorizontalIcon data-icon="inline-start" />
        {t("Parameters")}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md" showCloseButton={false}>
        <SheetClose
          render={
            <Button
              aria-label={t("Close")}
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <SheetHeader>
          <SheetTitle>{t("Model parameters")}</SheetTitle>
          <SheetDescription>
            {t("Tune the system instruction and generation behavior for this conversation.")}
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="playground-system-prompt">{t("System prompt")}</FieldLabel>
              <Textarea
                className="min-h-40 resize-y"
                id="playground-system-prompt"
                onChange={(event) => onSystemPromptChange(event.target.value)}
                value={systemPrompt}
              />
              <FieldDescription>
                {t("Applied to every request in the current conversation.")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="playground-temperature">
                {t("Temperature")}: {temperature.toFixed(1)}
              </FieldLabel>
              <Slider
                aria-label={t("Temperature")}
                id="playground-temperature"
                max={2}
                min={0}
                onValueChange={(value) => onTemperatureChange(Number(value))}
                step={0.1}
                value={temperature}
              />
              <FieldDescription>{t("Lower values are more deterministic.")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="playground-max-tokens">{t("Maximum output tokens")}</FieldLabel>
              <Input
                id="playground-max-tokens"
                max={32768}
                min={1}
                onChange={(event) =>
                  onMaxTokensChange(Math.min(32768, Math.max(1, Number(event.target.value))))
                }
                type="number"
                value={maxTokens}
              />
              <FieldDescription>
                {t("Limits the maximum length of the assistant response.")}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}
