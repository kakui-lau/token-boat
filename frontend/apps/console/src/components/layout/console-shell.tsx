import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type PropsWithChildren,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  BellRingIcon,
  BookOpenIcon,
  BoxesIcon,
  CheckSquareIcon,
  CircleDollarSignIcon,
  CircleHelpIcon,
  CommandIcon,
  CreditCardIcon,
  HistoryIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  MessageSquareTextIcon,
  MoonIcon,
  MonitorIcon,
  PaletteIcon,
  ScrollTextIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  SunIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WalletCardsIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@token-boat/ui/components/ui/dropdown-menu";
import { Kbd } from "@token-boat/ui/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@token-boat/ui/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  useSidebar,
} from "@token-boat/ui/components/ui/sidebar";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { useLayoutPreferences } from "@/app/layout/layout-preferences-context";
import { BrandMark } from "@/components/brand-mark";
import { HeaderActions } from "@/components/layout/header-actions";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { HeaderUserMenu, SidebarUserMenu } from "@/components/layout/sidebar-user-menu";
import { AlertStatusPopover } from "@/features/alerts/components/alert-status-popover";

const loadConsoleCommandMenu = () => import("@/components/layout/console-command-menu");
const ConsoleCommandMenu = lazy(loadConsoleCommandMenu);

export type ConsoleRoute =
  | "/"
  | "/getting-started"
  | "/playground"
  | "/integration"
  | "/api-keys"
  | "/models"
  | "/usage"
  | "/logs"
  | "/activity"
  | "/tasks"
  | "/alerts"
  | "/recharge"
  | "/billing"
  | "/team"
  | "/account";

export type NavigationItem = {
  label: string;
  to: ConsoleRoute;
  icon: ComponentType<{ className?: string }>;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export type CommandAction = {
  checked?: boolean;
  icon: ComponentType<{ className?: string }>;
  id: string;
  keywords?: string[];
  label: string;
  onSelect(): void;
};

export function ConsoleShell({ children }: PropsWithChildren) {
  const { preferences, updatePreferences } = useLayoutPreferences();

  return (
    <SidebarProvider
      className="bg-muted/35"
      data-dashboard-density={preferences.density}
      data-reduced-motion={preferences.reducedMotion}
      data-sidebar-variant={preferences.sidebarVariant}
      onOpenChange={(open) => updatePreferences({ sidebarCollapsed: !open })}
      open={!preferences.sidebarCollapsed}
    >
      <ConsoleShellContent>{children}</ConsoleShellContent>
    </SidebarProvider>
  );
}

function ConsoleShellContent({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preferences, updatePreferences } = useLayoutPreferences();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const currentRoute = pathname.startsWith("/console")
    ? pathname.slice("/console".length) || "/"
    : pathname;

  const navigationGroups: NavigationGroup[] = [
    {
      label: t("Workspace"),
      items: [
        { label: t("Overview"), to: "/", icon: LayoutDashboardIcon },
        { label: t("Getting started"), to: "/getting-started", icon: SparklesIcon },
        { label: t("Playground"), to: "/playground", icon: MessageSquareTextIcon },
      ],
    },
    {
      label: t("Develop"),
      items: [
        { label: t("Integration center"), to: "/integration", icon: BookOpenIcon },
        { label: t("API keys"), to: "/api-keys", icon: KeyRoundIcon },
        { label: t("Models and pricing"), to: "/models", icon: BoxesIcon },
      ],
    },
    {
      label: t("Operate"),
      items: [
        { label: t("Usage"), to: "/usage", icon: CircleDollarSignIcon },
        { label: t("Request logs"), to: "/logs", icon: ScrollTextIcon },
        { label: t("Tasks"), to: "/tasks", icon: CheckSquareIcon },
        { label: t("Alerts and status"), to: "/alerts", icon: BellRingIcon },
      ],
    },
    {
      label: t("Account and organization"),
      items: [
        { label: t("Recharge center"), to: "/recharge", icon: WalletCardsIcon },
        { label: t("Billing and subscriptions"), to: "/billing", icon: CreditCardIcon },
        { label: t("Account activity"), to: "/activity", icon: HistoryIcon },
        { label: t("Team and access"), to: "/team", icon: UsersRoundIcon },
        { label: t("Account settings"), to: "/account", icon: UserRoundIcon },
      ],
    },
  ];
  const commandActions: CommandAction[] = [
    {
      checked: preferences.themeMode === "light",
      icon: SunIcon,
      id: "theme-light",
      keywords: [t("Appearance"), t("Theme settings")],
      label: t("Use light theme"),
      onSelect: () => updatePreferences({ themeMode: "light" }),
    },
    {
      checked: preferences.themeMode === "dark",
      icon: MoonIcon,
      id: "theme-dark",
      keywords: [t("Appearance"), t("Theme settings")],
      label: t("Use dark theme"),
      onSelect: () => updatePreferences({ themeMode: "dark" }),
    },
    {
      checked: preferences.themeMode === "system",
      icon: MonitorIcon,
      id: "theme-system",
      keywords: [t("Appearance"), t("Theme settings")],
      label: t("Follow system theme"),
      onSelect: () => updatePreferences({ themeMode: "system" }),
    },
    {
      icon: PaletteIcon,
      id: "theme-settings",
      keywords: [t("Preferences"), t("Appearance")],
      label: t("Open theme settings"),
      onSelect: () => void navigate({ to: "/account", search: { tab: "theme" } }),
    },
  ];

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  useEffect(() => {
    const openCommandMenu = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      void loadConsoleCommandMenu();
      setSearchOpen((open) => !open);
    };

    window.addEventListener("keydown", openCommandMenu);
    return () => window.removeEventListener("keydown", openCommandMenu);
  }, []);

  const goTo = (to: ConsoleRoute) => {
    setSearchOpen(false);
    void navigate({ to });
  };

  return (
    <>
      <Sidebar
        collapsible={preferences.sidebarCollapsible}
        mobileDescription={t("User Console")}
        mobileTitle={t("User Console")}
        variant={preferences.sidebarVariant}
      >
        <SidebarHeader className="h-16 justify-center group-data-[collapsible=icon]:h-12">
          <div className="flex items-center gap-3 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Link
              aria-label={t("Overview")}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent/70 p-1 shadow-sm ring-1 ring-sidebar-border transition-[width,height,padding,border-radius] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0.5"
              to="/"
            >
              <BrandMark
                aria-hidden="true"
                className="size-8 group-data-[collapsible=icon]:size-7"
              />
            </Link>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold">Token Boat</div>
              <div className="truncate text-xs text-sidebar-foreground/65">{t("User Console")}</div>
            </div>
            {isMobile && (
              <Button
                aria-label={t("Close navigation")}
                onClick={() => setOpenMobile(false)}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon data-icon="inline-start" />
              </Button>
            )}
          </div>
        </SidebarHeader>
        <SidebarSeparator />

        <SidebarContent>
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          isActive={currentRoute === item.to}
                          render={<Link activeOptions={{ exact: item.to === "/" }} to={item.to} />}
                          tooltip={item.label}
                        >
                          <Icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter>
          <SidebarUserMenu collapsed={state === "collapsed" && !isMobile} />
        </SidebarFooter>
        <SidebarRail
          aria-label={preferences.sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
          title={preferences.sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")}
        />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-muted/35">
        <header
          className={
            preferences.navbarStyle === "sticky"
              ? "sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-lg lg:px-6"
              : "relative z-30 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur-lg lg:px-6"
          }
        >
          <SidebarTrigger
            aria-label={
              isMobile
                ? t("Open navigation")
                : preferences.sidebarCollapsed
                  ? t("Expand sidebar")
                  : t("Collapse sidebar")
            }
          />

          <Button
            className="ml-1 min-w-0 flex-1 justify-start bg-muted/45 text-muted-foreground sm:max-w-sm"
            onClick={() => setSearchOpen(true)}
            onFocus={() => void loadConsoleCommandMenu()}
            onPointerEnter={() => void loadConsoleCommandMenu()}
            variant="outline"
          >
            <SearchIcon aria-hidden="true" />
            <span className="truncate">{t("Search pages and actions")}</span>
            <Kbd className="ml-auto hidden bg-background sm:flex">
              <CommandIcon aria-hidden="true" className="size-3" />K
            </Kbd>
          </Button>

          <HeaderActions>
            <Button
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link aria-label={t("Help and integration")} to="/integration" />}
              size="icon"
              variant="ghost"
            >
              <CircleHelpIcon data-icon="inline-start" />
            </Button>
            <AlertStatusPopover
              className="hidden sm:inline-flex"
              onOpenAlertCenter={() => void navigate({ to: "/alerts" })}
            />
            <LanguageSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button aria-label={t("Appearance")} size="icon" variant="ghost" />}
              >
                <SunIcon className="dark:hidden" data-icon="inline-start" />
                <MoonIcon className="hidden dark:block" data-icon="inline-start" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("Appearance")}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => updatePreferences({ themeMode: "light" })}>
                    <SunIcon data-icon="inline-start" /> {t("Light")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updatePreferences({ themeMode: "dark" })}>
                    <MoonIcon data-icon="inline-start" /> {t("Dark")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updatePreferences({ themeMode: "system" })}>
                    <SettingsIcon data-icon="inline-start" /> {t("System")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <HeaderUserMenu />
          </HeaderActions>
        </header>

        <div
          className={
            preferences.contentLayout === "centered"
              ? `mx-auto w-full max-w-screen-2xl ${preferences.density === "compact" ? "p-3 lg:p-4" : "p-4 lg:p-6"}`
              : `w-full max-w-none ${preferences.density === "compact" ? "p-3 lg:p-4" : "p-4 lg:p-6"}`
          }
        >
          {children}
        </div>
      </SidebarInset>

      {searchOpen && (
        <Suspense fallback={<CommandMenuLoading onOpenChange={setSearchOpen} open={searchOpen} />}>
          <ConsoleCommandMenu
            actions={commandActions}
            navigationGroups={navigationGroups}
            onNavigate={goTo}
            onOpenChange={setSearchOpen}
            open={searchOpen}
          />
        </Suspense>
      )}
    </>
  );
}

function CommandMenuLoading(props: { onOpenChange(open: boolean): void; open: boolean }) {
  const { t } = useTranslation();

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogHeader className="sr-only">
        <DialogTitle>{t("Command menu")}</DialogTitle>
        <DialogDescription>{t("Search pages and actions")}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3 translate-y-0 gap-2 overflow-hidden rounded-xl p-2 sm:max-w-lg"
        showCloseButton={false}
      >
        <div aria-live="polite" className="space-y-2" role="status">
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="space-y-1 p-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-4/5" />
          </div>
          <span className="sr-only">{t("Loading command menu")}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
