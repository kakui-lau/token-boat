import { useTranslation } from "react-i18next";
import { ExpandIcon, LayoutPanelLeftIcon, Rows3Icon, Rows4Icon } from "lucide-react";

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
import { ToggleGroup, ToggleGroupItem } from "@token-boat/ui/components/ui/toggle-group";
import type { ContentLayout, NavbarStyle } from "@token-boat/app-core";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";

export function LayoutPreferencesCard() {
  const { t } = useTranslation();
  const { preferences, updatePreferences } = useLayoutPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Page layout")}</CardTitle>
        <CardDescription>{t("Control page width and navbar scrolling behavior.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel id="content-layout-preference">{t("Content layout")}</FieldLabel>
            <ToggleGroup
              aria-labelledby="content-layout-preference"
              className="grid w-full grid-cols-2"
              onValueChange={(values) => {
                const value = values[0] as ContentLayout | undefined;
                if (value) updatePreferences({ contentLayout: value });
              }}
              value={[preferences.contentLayout]}
              variant="outline"
            >
              <ToggleGroupItem className="h-auto flex-col py-3" value="centered">
                <LayoutPanelLeftIcon />
                {t("Centered")}
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto flex-col py-3" value="full-width">
                <ExpandIcon />
                {t("Full width")}
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <Field>
            <FieldLabel id="navbar-style-preference">{t("Navbar behavior")}</FieldLabel>
            <ToggleGroup
              aria-labelledby="navbar-style-preference"
              className="grid w-full grid-cols-2"
              onValueChange={(values) => {
                const value = values[0] as NavbarStyle | undefined;
                if (value) updatePreferences({ navbarStyle: value });
              }}
              value={[preferences.navbarStyle]}
              variant="outline"
            >
              <ToggleGroupItem value="sticky">
                <Rows3Icon data-icon="inline-start" /> {t("Sticky")}
              </ToggleGroupItem>
              <ToggleGroupItem value="scroll">
                <Rows4Icon data-icon="inline-start" /> {t("Scroll")}
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {t("Changes are saved automatically and applied instantly.")}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
