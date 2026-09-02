import { describe, expect, test } from "vitest";

import {
  adminNavigationItems,
  deferredAdminCapabilities,
  embeddedAdminCapabilities,
} from "@/app/route-catalog";
import { userConsoleCapabilities } from "@token-boat/app-core/product-surfaces";

describe("admin route catalog boundary", () => {
  test("keeps the focused administration destinations inside the admin application", () => {
    const paths = adminNavigationItems.map((item) => item.path);

    expect(paths).toHaveLength(18);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith("/admin/"))).toBe(true);
    expect(paths.some((path) => path.startsWith("/admin/users/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("/console/"))).toBe(false);
  });

  test("keeps the active gateway, pricing, customer, finance, and system domains visible", () => {
    expect(adminNavigationItems.map((item) => item.capabilityId)).toEqual([
      "admin-overview",
      "channels",
      "requests",
      "channel-usage",
      "diagnostics",
      "models",
      "official-pricing",
      "purchase-pricing",
      "price-books",
      "pricing-governance",
      "users",
      "customer-usage",
      "finance",
      "subscriptions",
      "redemptions",
      "system-settings",
      "system-info",
      "audit-logs",
    ]);
  });

  test("places related capabilities inside an owning workspace", () => {
    const navigationIds = new Set<string>(adminNavigationItems.map((item) => item.capabilityId));

    expect(embeddedAdminCapabilities.every((item) => navigationIds.has(item.owner))).toBe(true);
    expect(embeddedAdminCapabilities).toContainEqual({
      capabilityId: "deployments",
      owner: "models",
      featureGate: "io.net",
    });
    expect(embeddedAdminCapabilities).toContainEqual({
      capabilityId: "tasks",
      owner: "requests",
    });
  });

  test("keeps unsupported domains deferred instead of exposing empty navigation", () => {
    const navigationIds = new Set<string>(adminNavigationItems.map((item) => item.capabilityId));

    expect(deferredAdminCapabilities.map((item) => item.capabilityId)).toEqual([
      "workspace-membership",
      "user-alert-rules",
      "incident-management",
    ]);
    expect(deferredAdminCapabilities.every((item) => !navigationIds.has(item.capabilityId))).toBe(
      true,
    );
  });

  test("keeps the User Console catalog self-scoped instead of encoding admin routes", () => {
    expect(userConsoleCapabilities).toHaveLength(15);
    expect(
      userConsoleCapabilities.every((capability) => capability.consoleDataVisibility === "limited"),
    ).toBe(true);
    expect(userConsoleCapabilities.some((capability) => "adminPath" in capability)).toBe(false);
  });
});
