import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { HeaderUserMenu } from "../sidebar-user-menu";

const { navigate, sessionState, signOut } = vi.hoisted(() => ({
  navigate: vi.fn(),
  sessionState: { signingOut: false },
  signOut: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    session: {
      user: {
        displayName: "Demo Developer",
        email: "demo@token-boat.local",
        group: "default",
        username: "demo",
      },
    },
    signOut,
    signingOut: sessionState.signingOut,
  }),
}));

beforeEach(() => {
  navigate.mockReset();
  signOut.mockReset();
  sessionState.signingOut = false;
});

describe("HeaderUserMenu", () => {
  test("keeps the signed-in user entry in the header", () => {
    render(<HeaderUserMenu />);

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    expect(trigger).toHaveTextContent("Demo Developer");
    expect(trigger).toHaveTextContent("DD");
  });

  test("opens theme settings inside the account page", async () => {
    render(<HeaderUserMenu />);

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(await screen.findByText("Theme settings"));

    expect(navigate).toHaveBeenCalledWith({ to: "/account", search: { tab: "theme" } });
  });

  test("locks the account trigger while sign-out is pending", () => {
    sessionState.signingOut = true;
    render(<HeaderUserMenu />);

    const trigger = screen.getByRole("button", { name: "Open account menu" });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
  });
});
