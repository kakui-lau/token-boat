import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SidebarUserMenu } from "../sidebar-user-menu";

const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    mode: "demo" as "demo" | "live",
    signOut: vi.fn(),
    signingOut: false,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    mode: sessionState.mode,
    session: {
      sessionId: "session-test",
      user: {
        id: 1,
        username: "demo-owner",
        displayName: "Demo Owner",
        email: "demo@example.com",
        group: "default",
        role: 1,
        quotaUnits: 100,
        usedQuotaUnits: 0,
        requestCount: 0,
        createdAt: 1_700_000_000,
      },
    },
    signOut: sessionState.signOut,
    signingOut: sessionState.signingOut,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  sessionState.mode = "demo";
});

describe("user environment badge", () => {
  test("shows a compact demo-data badge beside the signed-in identity", () => {
    render(<SidebarUserMenu collapsed={false} />);

    expect(screen.getByText("Demo Owner")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  test("does not add an environment badge for a live account", () => {
    sessionState.mode = "live";

    render(<SidebarUserMenu collapsed={false} />);

    expect(screen.getByText("Demo Owner")).toBeInTheDocument();
    expect(screen.queryByText("Demo data")).not.toBeInTheDocument();
  });
});
