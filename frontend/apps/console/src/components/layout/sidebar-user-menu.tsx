import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ChevronsUpDownIcon,
  LoaderCircleIcon,
  LogOutIcon,
  PaletteIcon,
  UserRoundIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@token-boat/ui/components/ui/avatar";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@token-boat/ui/components/ui/dropdown-menu";
import { cn } from "@token-boat/ui/lib/utils";
import { useSession } from "@/app/session/session-context";

type UserMenuProps = {
  collapsed: boolean;
  placement: "header" | "sidebar";
};

export function HeaderUserMenu() {
  return <UserMenu collapsed={false} placement="header" />;
}

export function SidebarUserMenu(props: { collapsed: boolean }) {
  return <UserMenu collapsed={props.collapsed} placement="sidebar" />;
}

function UserMenu(props: UserMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, session, signOut, signingOut } = useSession();
  const isHeader = props.placement === "header";
  const user = session?.user;
  const displayName = user?.displayName || user?.username || t("User");
  const secondaryText = user?.email || user?.username || t("Signed in");
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = () => {
    void signOut()
      .then(() => navigate({ to: "/sign-in", replace: true, search: { redirect: undefined } }))
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : t("Unable to sign out")),
      );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("Open account menu")}
            aria-busy={signingOut}
            className={cn(
              isHeader
                ? "h-9 w-auto max-w-48 justify-start gap-2 px-1.5"
                : "h-auto w-full justify-start gap-2 px-2 py-2 text-left",
              props.collapsed && "justify-center px-0",
            )}
            variant="ghost"
            disabled={signingOut}
          />
        }
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">
            {initials || "TB"}
          </AvatarFallback>
        </Avatar>
        {!props.collapsed && !isHeader && (
          <>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{displayName}</span>
                {mode === "demo" && <DemoDataBadge />}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {secondaryText}
              </span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
          </>
        )}
        {isHeader && (
          <>
            <span className="hidden max-w-32 truncate text-sm font-medium lg:block">
              {displayName}
            </span>
            <ChevronsUpDownIcon
              aria-hidden="true"
              className="hidden text-muted-foreground sm:block"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        side={isHeader ? "bottom" : "right"}
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {initials || "TB"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{displayName}</span>
                  {mode === "demo" && <DemoDataBadge />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{secondaryText}</div>
              </div>
            </div>
            {user?.group && (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t("Account group")}</span>
                <Badge variant="secondary">{user.group}</Badge>
              </div>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void navigate({ to: "/account" })}>
            <UserRoundIcon data-icon="inline-start" /> {t("Account settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => void navigate({ to: "/account", search: { tab: "theme" } })}
          >
            <PaletteIcon data-icon="inline-start" /> {t("Theme settings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={signingOut} onClick={handleSignOut} variant="destructive">
            {signingOut ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogOutIcon data-icon="inline-start" />
            )}
            {t(signingOut ? "Signing out…" : "Sign out")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DemoDataBadge() {
  const { t } = useTranslation();

  return (
    <Badge className="h-4 shrink-0 rounded px-1 text-[10px] leading-none" variant="outline">
      {t("Demo data")}
    </Badge>
  );
}
