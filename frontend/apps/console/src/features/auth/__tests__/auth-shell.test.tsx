import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AuthShell } from "../components/auth-shell";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: "zh" },
    t: (key: string) => key,
  }),
}));

describe("AuthShell", () => {
  test("keeps the authentication surface full-bleed and constrained to the viewport", () => {
    const { container } = render(
      <AuthShell>
        <div>Authentication form</div>
      </AuthShell>,
    );

    expect(screen.getByRole("main")).toHaveClass("h-svh", "overflow-hidden");
    expect(container.querySelector(".auth-stage-shell")).toHaveClass("max-w-none", "p-0");
    expect(container.querySelector(".auth-visual-panel")).toHaveClass(
      "auth-visual-panel--sculpted",
    );
    expect(container.querySelector("#auth-panel-smooth-clip")).toBeInTheDocument();
    expect(screen.getAllByText("AI API Console")).not.toHaveLength(0);
    expect(screen.getByText("Secure sign-in")).toBeVisible();
    expect(screen.getByRole("button", { name: "Language" })).toBeVisible();
  });

  test("lets the user pause and resume the ambient particle animation", () => {
    render(
      <AuthShell>
        <div>Authentication form</div>
      </AuthShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause background animation" }));
    expect(screen.getByRole("button", { name: "Resume background animation" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Resume background animation" }));
    expect(screen.getByRole("button", { name: "Pause background animation" })).toBeVisible();
  });
});
