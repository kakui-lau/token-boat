/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Blocks,
  KeyRound,
  Route,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { PublicLayout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const capabilities = [
  {
    icon: Blocks,
    title: "Unified model gateway",
    description: "Feature unified gateway description",
  },
  {
    icon: Route,
    title: "Flexible routing control",
    description: "Feature routing description",
  },
  {
    icon: WalletCards,
    title: "Transparent Billing",
    description: "Feature billing description",
  },
  {
    icon: KeyRound,
    title: "Access control",
    description: "Feature access description",
  },
  {
    icon: BarChart3,
    title: "Operational visibility",
    description: "Feature observability description",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise operations",
    description: "Feature enterprise description",
  },
];

export function FeaturesIntroduction() {
  const { t } = useTranslation();

  return (
    <PublicLayout showMainContainer={false}>
      <div className="token-boat-home relative overflow-hidden pt-24 pb-16">
        <div aria-hidden className="token-boat-aurora opacity-50" />
        <div aria-hidden className="token-boat-beam opacity-40" />
        <div className="relative container mx-auto flex max-w-6xl flex-col gap-12 px-4">
          <header className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center">
            <Badge variant="secondary" className="rounded-full">
              <Blocks aria-hidden="true" />
              {t("TokenBoat Capabilities")}
            </Badge>
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
                {t("One gateway for production AI workloads")}
              </h1>
              <p className="text-muted-foreground mx-auto max-w-3xl text-base leading-7 sm:text-lg">
                {t("Features introduction summary")}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button render={<Link to="/dashboard" />}>
                {t("Open console")}
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" render={<Link to="/pricing" />}>
                {t("View Pricing")}
              </Button>
            </div>
          </header>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => {
              const Icon = capability.icon;
              return (
                <Card
                  key={capability.title}
                  className="border-primary/10 bg-background/80 backdrop-blur-xl"
                >
                  <CardHeader>
                    <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <CardTitle>{t(capability.title)}</CardTitle>
                    <CardDescription className="leading-6">
                      {t(capability.description)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>

          <Card className="border-primary/10 from-primary/8 to-secondary/8 bg-gradient-to-r">
            <CardHeader>
              <CardTitle>{t("From integration to operations")}</CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                {t("Feature workflow description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-4 md:grid-cols-3">
                {[
                  ["01", "Connect applications", "Feature connect step"],
                  ["02", "Apply routing and billing", "Feature control step"],
                  ["03", "Monitor and optimize", "Feature optimize step"],
                ].map(([number, title, description]) => (
                  <li
                    key={number}
                    className="bg-background/70 flex flex-col gap-3 rounded-xl p-5"
                  >
                    <span className="text-primary text-sm font-semibold">
                      {number}
                    </span>
                    <h3 className="font-semibold">{t(title)}</h3>
                    <p className="text-muted-foreground text-sm leading-6">
                      {t(description)}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button render={<Link to="/support/community-interaction" />}>
                {t("Contact us")}
              </Button>
              <Button variant="ghost" render={<Link to="/terms" />}>
                {t("Terms of Service")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PublicLayout>
  );
}
