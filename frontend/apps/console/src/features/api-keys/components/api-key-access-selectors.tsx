import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDownIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@token-boat/ui/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@token-boat/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import type { ApiKeyGroupOption, PlaygroundModel } from "@/data/contracts";
import { repository } from "@/data/repository";

export function useApiKeyGroupOptions(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["api-key-groups"],
    queryFn: () => repository.listApiKeyGroups(),
  });
}

export function useApiKeyModelOptions(group: string, enabled: boolean) {
  return useQuery({
    enabled: enabled && group.trim().length > 0,
    queryKey: ["api-key-models", group],
    queryFn: () => repository.listPlaygroundModels(group),
  });
}

type ApiKeyGroupSelectProps = {
  error: boolean;
  id: string;
  loading: boolean;
  onRetry(): void;
  onValueChange(value: string): void;
  options: ApiKeyGroupOption[];
  value: string;
};

export function ApiKeyGroupSelect(props: ApiKeyGroupSelectProps) {
  const { t } = useTranslation();
  const selected = props.options.find((option) => option.value === props.value);
  const unavailableCurrent = props.value && !selected ? props.value : null;
  let triggerLabel = props.value || t("Select a group");
  if (props.loading) triggerLabel = t("Loading groups");
  if (props.error) triggerLabel = t("Unable to load groups");
  if (!props.loading && !props.error && props.options.length === 0 && props.value.length === 0) {
    triggerLabel = t("No groups available");
  }
  const items = [
    ...(unavailableCurrent
      ? [{ label: `${unavailableCurrent} · ${t("Unavailable")}`, value: unavailableCurrent }]
      : []),
    ...props.options.map((option) => ({ label: option.value, value: option.value })),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <Select
        disabled={props.loading || props.error || props.options.length === 0}
        items={items}
        onValueChange={(value) => {
          if (typeof value === "string" && value) props.onValueChange(value);
        }}
        value={props.value || null}
      >
        <SelectTrigger aria-busy={props.loading || undefined} className="w-full" id={props.id}>
          <SelectValue>{triggerLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} side="bottom">
          <SelectGroup>
            {unavailableCurrent && (
              <SelectItem disabled value={unavailableCurrent}>
                {unavailableCurrent} · {t("Unavailable")}
              </SelectItem>
            )}
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{option.value}</span>
                  {option.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {props.error && (
        <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
          <span>{t("Unable to load groups")}</span>
          <Button onClick={props.onRetry} size="xs" type="button" variant="ghost">
            <RotateCcwIcon data-icon="inline-start" />
            {t("Retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

type ApiKeyModelSelectProps = {
  error: boolean;
  id: string;
  loading: boolean;
  onRetry(): void;
  onValueChange(value: string[]): void;
  options: PlaygroundModel[];
  value: string[];
};

export function ApiKeyModelSelect(props: ApiKeyModelSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const availableIds = new Set(props.options.map((option) => option.id));
  const unavailableSelections = props.value.filter((model) => !availableIds.has(model));
  const allOptions = [
    ...props.options,
    ...unavailableSelections.map((model) => ({
      id: model,
      label: `${model} · ${t("Unavailable")}`,
      group: "",
    })),
  ];
  let triggerLabel = t("All models in the account group");
  if (props.value.length === 1) triggerLabel = props.value[0] ?? triggerLabel;
  if (props.value.length > 1) {
    triggerLabel = t("{{count}} models selected", { count: props.value.length });
  }
  if (props.loading) triggerLabel = t("Loading models");
  if (props.error) triggerLabel = t("Unable to load models");
  if (!props.loading && !props.error && props.options.length === 0 && props.value.length === 0) {
    triggerLabel = t("No models available");
  }

  const toggleModel = (model: string) => {
    if (props.value.includes(model)) {
      props.onValueChange(props.value.filter((selected) => selected !== model));
      return;
    }
    props.onValueChange([...props.value, model]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          render={
            <Button
              aria-busy={props.loading || undefined}
              aria-expanded={open}
              aria-haspopup="listbox"
              className="w-full justify-between font-normal"
              disabled={
                props.loading ||
                props.error ||
                (props.options.length === 0 && props.value.length === 0)
              }
              id={props.id}
              role="combobox"
              type="button"
              variant="outline"
            />
          }
        >
          <span className="truncate">{triggerLabel}</span>
          {props.loading ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <ChevronsUpDownIcon aria-hidden="true" />
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) p-0">
          <Command>
            <CommandInput placeholder={t("Search models")} />
            <CommandList>
              <CommandEmpty>{t("No models found")}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  data-checked={props.value.length === 0}
                  onSelect={() => props.onValueChange([])}
                  value="all-models-in-group"
                >
                  <span className="truncate">{t("All models in the account group")}</span>
                </CommandItem>
                {allOptions.map((model) => (
                  <CommandItem
                    data-checked={props.value.includes(model.id)}
                    key={model.id}
                    onSelect={() => toggleModel(model.id)}
                    value={model.id}
                  >
                    <span className="truncate">{model.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {props.error && (
        <div className="flex items-center gap-2 text-xs text-destructive" role="alert">
          <span>{t("Unable to load models")}</span>
          <Button onClick={props.onRetry} size="xs" type="button" variant="ghost">
            <RotateCcwIcon data-icon="inline-start" />
            {t("Retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
