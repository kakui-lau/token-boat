import { useTranslation } from "react-i18next";
import { BoxesIcon, Layers3Icon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";

import {
  adminNavigationItems,
  deferredAdminCapabilities,
  embeddedAdminCapabilities,
} from "@/app/route-catalog";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";

export function AdminOverviewPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Badge className="w-fit" variant="outline">
          {t("admin.badge")}
        </Badge>
        <div className="max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t("admin.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
            {t("admin.description")}
          </p>
        </div>
      </section>

      <Alert>
        <ShieldCheckIcon aria-hidden="true" />
        <AlertTitle>{t("bootstrap.title")}</AlertTitle>
        <AlertDescription>{t("bootstrap.description")}</AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <UsersRoundIcon aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>{t("architecture.focusedNavigationTitle")}</CardTitle>
            <CardDescription>{t("architecture.focusedNavigationDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{adminNavigationItems.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("architecture.routes")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <BoxesIcon aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>{t("architecture.embeddedTitle")}</CardTitle>
            <CardDescription>{t("architecture.embeddedDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {embeddedAdminCapabilities.length}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("architecture.mergedCapabilities")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Layers3Icon aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>{t("architecture.deferredTitle")}</CardTitle>
            <CardDescription>{t("architecture.deferredDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {deferredAdminCapabilities.length}
            </p>
            <Badge className="mt-1" variant="secondary">
              {t("architecture.backendContractsRequired")}
            </Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
