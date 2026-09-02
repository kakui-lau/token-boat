import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { adminNavigationItems, type AdminNavigationItem } from "@/app/route-catalog";
import { AdminShell } from "@/components/admin-shell";
import { AdminCapabilityPage } from "@/features/capabilities/admin-capability-page";
import { AdminOverviewPage } from "@/features/overview/admin-overview-page";

const rootRoute = createRootRoute({
  component: AdminShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AdminOverviewPage,
});

const capabilityRoutes = adminNavigationItems
  .filter((item) => item.path !== "/admin/")
  .map((item) => createCapabilityRoute(item));

const routeTree = rootRoute.addChildren([indexRoute, ...capabilityRoutes]);

export const router = createRouter({
  basepath: "/admin",
  defaultPreload: "intent",
  routeTree,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function createCapabilityRoute(item: AdminNavigationItem) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: item.path.slice("/admin".length),
    component: () => <AdminCapabilityPage item={item} />,
  });
}
