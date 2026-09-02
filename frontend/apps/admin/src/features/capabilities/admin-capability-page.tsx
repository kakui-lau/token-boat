import { ConstructionIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminNavigationItem } from "@/app/route-catalog";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";

export function AdminCapabilityPage({ item }: { item: AdminNavigationItem }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Badge className="w-fit" variant={item.scope === "customers" ? "default" : "secondary"}>
          {t("scope." + item.scope)}
        </Badge>
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t(item.labelKey)}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
            {t(item.descriptionKey)}
          </p>
        </div>
      </section>

      <Alert>
        <ConstructionIcon aria-hidden="true" />
        <AlertTitle>{t("capability.scaffoldTitle")}</AlertTitle>
        <AlertDescription>{t("capability.scaffoldBoundary")}</AlertDescription>
      </Alert>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t("capability.includesTitle")}</CardTitle>
          <CardDescription>{t("capability.includesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("common.scaffolded")}</Badge>
            <Badge variant="secondary">
              {t(item.accessMode === "operate" ? "access.adminOperate" : "access.adminInspect")}
            </Badge>
            <Badge variant="secondary">
              {t(
                item.dataVisibility === "sensitive"
                  ? "capability.sensitiveVisibility"
                  : "capability.platformVisibility",
              )}
            </Badge>
          </div>
          {item.includedCapabilityKeys.length > 0 && (
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {item.includedCapabilityKeys.map((key) => (
                <li className="rounded-lg border bg-muted/35 px-3 py-2" key={key}>
                  {t(key)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
