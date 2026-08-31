import { useTranslation } from "react-i18next";
import {
  PanelLeftCloseIcon,
  PanelLeftDashedIcon,
  PanelLeftIcon,
  PanelLeftOpenIcon,
  PanelsTopLeftIcon,
  SquareDashedIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { SidebarCollapsible, SidebarVariant } from "@token-boat/app-core";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";
import { PreferenceSwitchField } from "./preference-switch-field";

export function SidebarPreferencesCard() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = useLayoutPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Sidebar")}</CardTitle>
        <CardDescription>
          {t("Choose the sidebar style and desktop collapse behavior.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel id="sidebar-variant-preference">{t("Sidebar style")}</FieldLabel>
            <ToggleGroup
              aria-labelledby="sidebar-variant-preference"
              className="grid w-full grid-cols-3"
              onValueChange={(values) => {
                const value = values[0] as SidebarVariant | undefined;
                if (value) updatePreferences({ sidebarVariant: value });
              }}
              value={[preferences.sidebarVariant]}
              variant="outline"
            >
              <ToggleGroupItem className="h-auto flex-col py-3" value="sidebar">
                <PanelLeftIcon />
                {t("Sidebar")}
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto flex-col py-3" value="inset">
                <PanelsTopLeftIcon />
                {t("Inset")}
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto flex-col py-3" value="floating">
                <SquareDashedIcon />
                {t("Floating")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel id="sidebar-collapse-mode-preference">
              {t("Sidebar collapse mode")}
            </FieldLabel>
            <ToggleGroup
              aria-labelledby="sidebar-collapse-mode-preference"
              className="grid w-full grid-cols-2"
              onValueChange={(values) => {
                const value = values[0] as SidebarCollapsible | undefined;
                if (value) updatePreferences({ sidebarCollapsible: value });
              }}
              value={[preferences.sidebarCollapsible]}
              variant="outline"
            >
              <ToggleGroupItem value="icon">
                <PanelLeftDashedIcon data-icon="inline-start" /> {t("Icon")}
              </ToggleGroupItem>
              <ToggleGroupItem value="offcanvas">
                <PanelLeftCloseIcon data-icon="inline-start" /> {t("Offcanvas")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <PreferenceSwitchField
            checked={preferences.sidebarCollapsed}
            description={t("Preview the selected collapse behavior now.")}
            icon={preferences.sidebarCollapsed ? PanelLeftCloseIcon : PanelLeftOpenIcon}
            id="sidebar-collapsed"
            label={t("Collapse sidebar")}
            onCheckedChange={(checked) => updatePreferences({ sidebarCollapsed: checked })}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
