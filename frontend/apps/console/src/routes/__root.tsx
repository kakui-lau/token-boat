import { lazy, Suspense } from "react";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { SessionBoundary } from "@/app/session/session-boundary";
import { GuestSessionBoundary } from "@/app/session/guest-session-boundary";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { RouteNotFound } from "@/components/route-not-found";
import { normalizeConsoleRedirect } from "@/features/auth/lib/auth-redirect";

const ConsoleShell = lazy(() =>
  import("@/components/layout/console-shell").then((module) => ({
    default: module.ConsoleShell,
  })),
);

export const Route = createRootRoute({
  component: RootLayout,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: RouteNotFound,
});

const guestPaths = new Set(["/forgot-password", "/register", "/sign-in"]);
const publicPaths = new Set(["/user/reset"]);

function RootLayout() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });

  if (guestPaths.has(location.pathname)) {
    const search = location.search as Record<string, unknown>;
    return (
      <GuestSessionBoundary authenticatedRedirect={normalizeConsoleRedirect(search.redirect)}>
        <Outlet />
      </GuestSessionBoundary>
    );
  }

  if (publicPaths.has(location.pathname) || location.pathname.startsWith("/oauth/")) {
    return <Outlet />;
  }

  return (
    <SessionBoundary>
      <Suspense fallback={<ConsoleShellLoading />}>
        <ConsoleShell>
          <Outlet />
        </ConsoleShell>
      </Suspense>
    </SessionBoundary>
  );
}

function ConsoleShellLoading() {
  const { t } = useTranslation();

  return (
    <div
      aria-live="polite"
      className="grid min-h-svh grid-cols-[15rem_1fr] bg-muted/35"
      role="status"
    >
      <div className="hidden border-r bg-sidebar p-4 md:block">
        <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="p-6">
        <div className="h-8 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-28 animate-pulse rounded-xl bg-muted" key={index} />
          ))}
        </div>
      </div>
      <span className="sr-only">{t("Loading")}</span>
    </div>
  );
}
