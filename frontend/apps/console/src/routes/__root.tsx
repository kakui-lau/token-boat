import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { SessionBoundary } from "@/app/session/session-boundary";
import { GuestSessionBoundary } from "@/app/session/guest-session-boundary";
import { ConsoleShell } from "@/components/layout/console-shell";
import { RouteErrorBoundary } from "@/components/route-error-boundary";
import { RouteNotFound } from "@/components/route-not-found";
import { normalizeConsoleRedirect } from "@/features/auth/lib/auth-redirect";

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
      <ConsoleShell>
        <Outlet />
      </ConsoleShell>
    </SessionBoundary>
  );
}
