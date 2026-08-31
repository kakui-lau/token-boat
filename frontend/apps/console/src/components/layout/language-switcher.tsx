import { LanguagesIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@token-boat/ui/components/ui/dropdown-menu";
import { languageOptions } from "@/features/preferences/lib/preference-options";

type SupportedLanguage = (typeof languageOptions)[number]["value"];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const currentLanguage: SupportedLanguage = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh";

  const changeLanguage = (language: string) => {
    if (language !== "en" && language !== "zh") return;
    void i18n.changeLanguage(language);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("Language")}
            className="min-w-9 gap-1 px-2"
            size="sm"
            variant="ghost"
          />
        }
      >
        <LanguagesIcon aria-hidden="true" className="size-4" />
        <span aria-hidden="true" className="text-xs font-semibold">
          {currentLanguage === "en" ? "EN" : "中"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("Language")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup onValueChange={changeLanguage} value={currentLanguage}>
            {languageOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
