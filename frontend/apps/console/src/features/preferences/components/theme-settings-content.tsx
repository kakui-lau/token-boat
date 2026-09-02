import { RotateCcwIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";
import { AppearancePreferencesCard } from "./appearance-preferences-card";
import { ExperiencePreferencesCard } from "./experience-preferences-card";
import { LayoutPreferencesCard } from "./layout-preferences-card";
import { SidebarPreferencesCard } from "./sidebar-preferences-card";

export function ThemeSettingsContent() {
  const { t } = useTranslation();
  const { resetPreferences } = useLayoutPreferences();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button className="w-fit" onClick={resetPreferences} variant="outline">
          <RotateCcwIcon data-icon="inline-start" />
          {t("Restore defaults")}
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <AppearancePreferencesCard />
        <LayoutPreferencesCard />
        <SidebarPreferencesCard />
        <ExperiencePreferencesCard />
      </div>
    </div>
  );
}
