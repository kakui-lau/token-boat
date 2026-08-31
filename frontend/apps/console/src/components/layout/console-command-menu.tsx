import { useTranslation } from "react-i18next";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@token-boat/ui/components/ui/command";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import type { CommandAction, ConsoleRoute, NavigationGroup } from "./console-shell";

type ConsoleCommandMenuProps = {
  actions: CommandAction[];
  navigationGroups: NavigationGroup[];
  onNavigate: (to: ConsoleRoute) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export default function ConsoleCommandMenu(props: ConsoleCommandMenuProps) {
  const { t, i18n } = useTranslation();

  return (
    <CommandDialog
      className="sm:max-w-lg"
      description={t("Search pages and actions")}
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={t("Command menu")}
    >
      <Command>
        <CommandInput autoFocus placeholder={t("Type to search...")} />
        <CommandList>
          <CommandEmpty>{t("No matching pages")}</CommandEmpty>
          {props.navigationGroups.map((group) => (
            <CommandGroup heading={group.label} key={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.to}
                    onSelect={() => props.onNavigate(item.to)}
                    value={item.label}
                  >
                    <Icon aria-hidden="true" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}
          {props.actions.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("Quick actions")}>
                {props.actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <CommandItem
                      data-checked={action.checked || undefined}
                      key={action.id}
                      onSelect={() => {
                        props.onOpenChange(false);
                        action.onSelect();
                      }}
                      value={[action.label, ...(action.keywords ?? [])].join(" ")}
                    >
                      <Icon aria-hidden="true" />
                      {action.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
        <CommandSeparator />
        <div className="flex items-center justify-between p-2 text-xs text-muted-foreground">
          <span>{t("Language")}</span>
          <Select
            onValueChange={(value) => value && void i18n.changeLanguage(value)}
            value={i18n.resolvedLanguage ?? "zh"}
          >
            <SelectTrigger aria-label={t("Language")} size="sm">
              <SelectValue>{i18n.resolvedLanguage === "en" ? "English" : "简体中文"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="zh">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </Command>
    </CommandDialog>
  );
}
