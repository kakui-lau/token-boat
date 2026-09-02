import { RotateCcwIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  InputGroupText,
} from "@token-boat/ui/components/ui/input-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
  const temperatureProfile =
    temperature <= 0.4 ? t("Precise") : temperature <= 1 ? t("Balanced") : t("Creative");

  return (
    <Sheet>
      <SheetTrigger render={<Button className={triggerClassName} variant="outline" />}>
        <SlidersHorizontalIcon data-icon="inline-start" />
        {t("Parameters")}
      </SheetTrigger>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-lg" showCloseButton={false}>
        <SheetClose
          render={
            <Button
              aria-label={t("Close")}
              className="absolute top-4 right-4"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <SheetHeader className="border-b px-5 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontalIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("Model parameters")}
          </SheetTitle>
          <SheetDescription>
            {t("Tune the system instruction and generation behavior for this conversation.")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-5">
          <FieldGroup className="gap-4">
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("Instructions")}</CardTitle>
                <CardDescription>{t("Set the assistant role and response rules.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="playground-system-prompt">{t("System prompt")}</FieldLabel>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t("{{count}} characters", { count: systemPrompt.length })}
                    </span>
                  </div>
                  <Textarea
                    className="min-h-36 resize-y"
                    id="playground-system-prompt"
                    onChange={(event) => onSystemPromptChange(event.target.value)}
                    value={systemPrompt}
                  />
                  <FieldDescription>
                    {t("Applied to every request in the current conversation.")}
                  </FieldDescription>
                </Field>
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("Generation controls")}</CardTitle>
                <CardDescription>{t("Control randomness and response length.")}</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-6">
                  <Field>
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel htmlFor="playground-temperature">{t("Temperature")}</FieldLabel>
                      <Badge variant="secondary">{temperatureProfile}</Badge>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
                      <div className="rounded-lg border bg-muted/30 px-3">
                        <Slider
                          aria-describedby="playground-temperature-description"
                          aria-label={t("Temperature")}
                          className="py-3"
                          id="playground-temperature"
                          max={2}
                          min={0}
                          onValueChange={(value) => onTemperatureChange(Number(value))}
                          step={0.1}
                          value={temperature}
                        />
                      </div>
                      <Input
                        aria-label={t("Temperature value")}
                        className="text-right tabular-nums"
                        max={2}
                        min={0}
                        onChange={(event) =>
                          onTemperatureChange(Math.min(2, Math.max(0, Number(event.target.value))))
                        }
                        step={0.1}
                        type="number"
                        value={temperature}
                      />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("More deterministic")}</span>
                        <span>{t("More creative")}</span>
                      </div>
                    </div>
                    <FieldDescription id="playground-temperature-description">
                      {t("Lower values make responses more consistent and focused.")}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="playground-max-tokens">
                      {t("Maximum output tokens")}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="playground-max-tokens"
                        max={32768}
                        min={1}
                        onChange={(event) =>
                          onMaxTokensChange(
                            Math.min(32768, Math.max(1, Number(event.target.value))),
                          )
                        }
                        type="number"
                        value={maxTokens}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{t("Tokens")}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>
                      {t("Limits the maximum length of the assistant response.")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </FieldGroup>
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t bg-muted/30 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t("Changes apply immediately to new messages.")}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              onClick={() => {
                onSystemPromptChange(t("You are a helpful assistant."));
                onTemperatureChange(0.7);
                onMaxTokensChange(1024);
              }}
              size="sm"
              variant="ghost"
            >
              <RotateCcwIcon data-icon="inline-start" />
              {t("Reset to defaults")}
            </Button>
            <SheetClose render={<Button size="sm" />}>{t("Done")}</SheetClose>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
