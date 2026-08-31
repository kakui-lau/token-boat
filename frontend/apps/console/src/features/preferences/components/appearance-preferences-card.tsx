import { useTranslation } from "react-i18next";
import { LanguagesIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { DashboardFont, ThemeMode, ThemePreset } from "@token-boat/app-core";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";
import { fontOptions, languageOptions, themePresetOptions } from "../lib/preference-options";

export function AppearancePreferencesCard() {
  const { t, i18n } = useTranslation();
  const { preferences, updatePreferences } = useLayoutPreferences();
  const currentLanguage = i18n.resolvedLanguage ?? "zh";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Appearance and language")}</CardTitle>
        <CardDescription>
          {t("Choose the dashboard theme, preset, font, and language.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel id="theme-preset-preference">{t("Theme preset")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                value && updatePreferences({ themePreset: value as ThemePreset })
              }
              value={preferences.themePreset}
            >
              <SelectTrigger aria-labelledby="theme-preset-preference" className="w-full">
                <SelectValue>
                  {t(
                    themePresetOptions.find((option) => option.value === preferences.themePreset)
                      ?.label ?? "Default",
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {themePresetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="size-2.5 rounded-full" data-theme-swatch={option.value} />
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel id="font-preference">{t("Font")}</FieldLabel>
            <Select
              onValueChange={(value) =>
                value && updatePreferences({ font: value as DashboardFont })
              }
              value={preferences.font}
            >
              <SelectTrigger aria-labelledby="font-preference" className="w-full">
                <SelectValue>
                  {fontOptions.find((option) => option.value === preferences.font)?.label ??
                    "Geist"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {fontOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel id="theme-mode-preference">{t("Theme mode")}</FieldLabel>
            <ToggleGroup
              aria-labelledby="theme-mode-preference"
              className="grid w-full grid-cols-3"
              onValueChange={(values) => {
                const value = values[0] as ThemeMode | undefined;
                if (value) updatePreferences({ themeMode: value });
              }}
              value={[preferences.themeMode]}
              variant="outline"
            >
              <ToggleGroupItem value="light">
                <SunIcon data-icon="inline-start" /> {t("Light")}
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <MoonIcon data-icon="inline-start" /> {t("Dark")}
              </ToggleGroupItem>
              <ToggleGroupItem value="system">
                <MonitorIcon data-icon="inline-start" /> {t("System")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel id="language-preference">{t("Language")}</FieldLabel>
            <Select
              onValueChange={(value) => value && void i18n.changeLanguage(value)}
              value={currentLanguage}
            >
              <SelectTrigger aria-labelledby="language-preference" className="w-full">
                <LanguagesIcon data-icon="inline-start" />
                <SelectValue>
                  {languageOptions.find((option) => option.value === currentLanguage)?.label ??
                    "简体中文"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
