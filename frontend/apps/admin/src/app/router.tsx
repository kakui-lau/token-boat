import { lazy, Suspense } from "react";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";

import { adminNavigationItems, type AdminNavigationItem } from "@/app/route-catalog";
import { AdminShell } from "@/components/admin-shell";
import { AdminCapabilityPage } from "@/features/capabilities/admin-capability-page";
import { AdminOverviewPage } from "@/features/overview/admin-overview-page";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";

const AdminChannelsPage = lazy(() =>
  import("@/features/channels/admin-channels-page").then((module) => ({
    default: module.AdminChannelsPage,
  })),
);

const AdminRequestsPage = lazy(() =>
  import("@/features/requests/admin-requests-page").then((module) => ({
    default: module.AdminRequestsPage,
  })),
);

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
    component: () => {
      let page = <AdminCapabilityPage item={item} />;
      if (item.capabilityId === "channels") page = <AdminChannelsPage />;
      if (item.capabilityId === "requests") page = <AdminRequestsPage />;
      return <Suspense fallback={<Skeleton className="h-[34rem] w-full" />}>{page}</Suspense>;
    },
  });
}
