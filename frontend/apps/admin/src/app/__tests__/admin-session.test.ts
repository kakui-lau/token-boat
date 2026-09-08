import { describe, expect, test } from "vitest";

import { adminSessionAllows } from "../admin-session-context";
import type { AdminSession } from "../../repository/contracts";

const session: AdminSession = {
  accessExpiresAt: 1_800_000_000,
  accessToken: "admin-token",
  user: {
    adminPermissions: {
      channel: { operate: true },
      finance: { operate: false },
    },
    displayName: "Ops",
    id: 7,
    role: 10,
    username: "operator",
  },
};

describe("admin session permissions", () => {
  test("allows only capabilities explicitly granted by the refresh session", () => {
    expect(adminSessionAllows(session, "channel", "operate")).toBe(true);
    expect(adminSessionAllows(session, "finance", "operate")).toBe(false);
    expect(adminSessionAllows(session, "channel", "write")).toBe(false);
    expect(adminSessionAllows(session, "unknown", "operate")).toBe(false);
  });
});
