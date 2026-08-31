import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { LoginSessionRecord } from "@/data/contracts";
import { describeUserAgent, SessionManagementCard } from "../components/session-management-card";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) =>
      Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) => value.replace(`{{${name}}}`, String(replacement)),
        key,
      ),
  }),
}));

describe("session management", () => {
  test("summarizes raw browser agents and exposes complete session details", async () => {
    render(
      <SessionManagementCard
        locale="en"
        onRevoke={vi.fn()}
        onRevokeOthers={vi.fn()}
        pending={false}
        sessions={sessionFixtures()}
      />,
    );

    expect(screen.getByText("Chrome · macOS")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View Chrome · macOS session details" }));

    const sheet = await screen.findByRole("dialog", { name: "Session details" });
    expect(sheet).toHaveTextContent("session-current-1234567890");
    expect(sheet).toHaveTextContent("Signed in");
    expect(sheet).toHaveTextContent("Session expires");
    expect(sheet).toHaveTextContent("Mozilla/5.0 (Macintosh");
  });

  test("confirms signing out every other device while preserving the current session", async () => {
    const onRevokeOthers = vi.fn();
    render(
      <SessionManagementCard
        locale="en"
        onRevoke={vi.fn()}
        onRevokeOthers={onRevokeOthers}
        pending={false}
        sessions={sessionFixtures()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out other sessions" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Sign out all other sessions?",
    });
    expect(confirmation).toHaveTextContent(
      "1 other sessions will be signed out. This current session stays active.",
    );
    fireEvent.click(within(confirmation).getByRole("button", { name: "Sign out other sessions" }));
    expect(onRevokeOthers).toHaveBeenCalledOnce();
  });

  test("keeps already-friendly device descriptions unchanged", () => {
    expect(describeUserAgent("Safari on iPhone")).toBe("Safari on iPhone");
    expect(describeUserAgent("")).toBe("Unknown device");
  });
});

function sessionFixtures(): LoginSessionRecord[] {
  return [
    {
      id: "session-current-1234567890",
      current: true,
      method: "passkey",
      ip: "192.0.2.8",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36",
      createdAt: 1_753_900_000,
      lastActiveAt: 1_754_000_000,
      expiresAt: 1_756_500_000,
    },
    {
      id: "session-mobile-1234567890",
      current: false,
      method: "password",
      ip: "192.0.2.24",
      userAgent: "Safari on iPhone",
      createdAt: 1_753_800_000,
      lastActiveAt: 1_753_950_000,
      expiresAt: 1_756_400_000,
    },
  ];
}
