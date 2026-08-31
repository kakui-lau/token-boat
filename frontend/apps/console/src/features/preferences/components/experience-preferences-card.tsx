import { useTranslation } from "react-i18next";
import { AlignJustifyIcon, MonitorIcon, SparklesIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { DashboardDensity } from "@token-boat/app-core";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";
import { PreferenceSwitchField } from "./preference-switch-field";

export function ExperiencePreferencesCard() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = useLayoutPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Density and motion")}</CardTitle>
        <CardDescription>
          {t("Tune dashboard spacing and animation for your working style.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel id="density-preference">{t("Information density")}</FieldLabel>
            <ToggleGroup
              aria-labelledby="density-preference"
              className="grid w-full grid-cols-2"
              onValueChange={(values) => {
                const value = values[0] as DashboardDensity | undefined;
                if (value) updatePreferences({ density: value });
              }}
              value={[preferences.density]}
              variant="outline"
            >
              <ToggleGroupItem value="comfortable">
                <SparklesIcon data-icon="inline-start" /> {t("Comfortable")}
              </ToggleGroupItem>
              <ToggleGroupItem value="compact">
                <AlignJustifyIcon data-icon="inline-start" /> {t("Compact")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <PreferenceSwitchField
            checked={preferences.reducedMotion}
            description={t("Minimize dashboard animations and layout transitions.")}
            icon={MonitorIcon}
            id="reduced-motion"
            label={t("Reduce motion")}
            onCheckedChange={(checked) => updatePreferences({ reducedMotion: checked })}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
