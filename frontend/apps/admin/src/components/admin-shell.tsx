import { Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  BoxesIcon,
  CircleIcon,
  CogIcon,
  CreditCardIcon,
  FileClockIcon,
  GaugeIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerCogIcon,
  ShieldCheckIcon,
  TicketIcon,
  UsersRoundIcon,
  WalletCardsIcon,
  WaypointsIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import { adminNavigationItems, adminRouteCatalog } from "@/app/route-catalog";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@token-boat/ui/components/ui/sidebar";

const logoUrl = `${import.meta.env.BASE_URL}brand/token-boat-logo-512.png`;

const capabilityIcons: Record<string, LucideIcon> = {
  "admin-overview": LayoutDashboardIcon,
  "audit-logs": FileClockIcon,
  "channel-usage": GaugeIcon,
  channels: WaypointsIcon,
  "customer-usage": GaugeIcon,
  diagnostics: WrenchIcon,
  finance: WalletCardsIcon,
  models: BoxesIcon,
  "official-pricing": ReceiptTextIcon,
  "price-books": CreditCardIcon,
  "pricing-governance": ShieldCheckIcon,
  "purchase-pricing": WalletCardsIcon,
  redemptions: TicketIcon,
  requests: ScrollTextIcon,
  subscriptions: CreditCardIcon,
  "system-info": ServerCogIcon,
  "system-settings": CogIcon,
  users: UsersRoundIcon,
};

export function AdminShell() {
  const { i18n, t } = useTranslation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "zh";
  const currentItem = adminNavigationItems.find((item) => item.path === pathname);

  return (
    <SidebarProvider className="bg-muted/35">
      <Sidebar
        collapsible="icon"
        mobileDescription={t("shell.navigation")}
        mobileTitle={t("shell.adminConsole")}
      >
        <SidebarHeader className="h-16 justify-center group-data-[collapsible=icon]:h-12">
          <a
            aria-label={t("nav.overview")}
            className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center"
            href="/admin/"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent/70 p-1 shadow-sm ring-1 ring-sidebar-border group-data-[collapsible=icon]:size-8">
              <img
                alt=""
                className="size-8 object-contain"
                height="512"
                src={logoUrl}
                width="512"
              />
            </span>
            <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold">Token Boat</span>
              <span className="block truncate text-xs text-sidebar-foreground/65">
                {t("shell.adminConsole")}
              </span>
            </span>
          </a>
        </SidebarHeader>
        <SidebarSeparator />

        <SidebarContent>
          {adminRouteCatalog.map((group) => (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel className="gap-2">{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = capabilityIcons[item.capabilityId] ?? CircleIcon;
                    const isActive = pathname === item.path;

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          render={
                            <a aria-current={isActive ? "page" : undefined} href={item.path} />
                          }
                          tooltip={t(item.labelKey)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{t(item.labelKey)}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarRail aria-label={t("shell.toggleNavigation")} title={t("shell.toggleNavigation")} />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-muted/35">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-lg lg:px-6">
          <SidebarTrigger aria-label={t("shell.toggleNavigation")} />
          <Badge className="ml-1 hidden sm:inline-flex" variant="secondary">
            <ShieldCheckIcon aria-hidden="true" />
            {t(`scope.${currentItem?.scope ?? "platform"}`)}
          </Badge>
          <div
            aria-disabled="true"
            className="ml-1 hidden min-w-0 flex-1 items-center gap-2 rounded-lg border bg-muted/45 px-3 py-2 text-sm text-muted-foreground md:flex md:max-w-sm"
          >
            <SearchIcon aria-hidden="true" className="size-4" />
            <span className="truncate">{t("common.searchDisabled")}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              aria-label={t("common.language")}
              onClick={() => void i18n.changeLanguage(language === "zh" ? "en" : "zh")}
              size="icon"
              variant="ghost"
            >
              <LanguagesIcon aria-hidden="true" />
            </Button>
            <Button nativeButton={false} render={<a href="/console/" />} variant="outline">
              <ArrowLeftIcon data-icon="inline-start" />
              <span className="hidden sm:inline">{t("common.returnToConsole")}</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[92rem] p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
