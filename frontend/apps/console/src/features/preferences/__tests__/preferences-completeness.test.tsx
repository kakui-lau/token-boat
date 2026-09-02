import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ThemeSettingsContent } from "../components/theme-settings-content";

const resetPreferences = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      changeLanguage: vi.fn(),
      resolvedLanguage: "zh",
    },
    t: (key: string) => key,
  }),
}));

vi.mock("@/app/layout/layout-preferences-context", () => ({
  useLayoutPreferences: () => ({
    preferences: {
      version: 3,
      themeMode: "system",
      themePreset: "default",
      font: "geist",
      contentLayout: "centered",
      navbarStyle: "sticky",
      sidebarVariant: "sidebar",
      sidebarCollapsible: "icon",
      sidebarCollapsed: false,
      density: "comfortable",
      reducedMotion: false,
    },
    resetPreferences,
    updatePreferences: vi.fn(),
  }),
}));

describe("theme settings", () => {
  test("keeps every dashboard preference in the account settings panel", () => {
    render(<ThemeSettingsContent />);

    expect(screen.queryByRole("heading", { name: "Theme settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore defaults" })).toBeInTheDocument();
    expect(screen.getByText("Theme preset")).toBeInTheDocument();
    expect(screen.getByText("Font")).toBeInTheDocument();
    expect(screen.getByText("Theme mode")).toBeInTheDocument();
    expect(screen.getByText("Content layout")).toBeInTheDocument();
    expect(screen.getByText("Navbar behavior")).toBeInTheDocument();
    expect(screen.getByText("Sidebar style")).toBeInTheDocument();
    expect(screen.getByText("Sidebar collapse mode")).toBeInTheDocument();
    expect(screen.getByText("Information density")).toBeInTheDocument();
    expect(screen.getByText("Reduce motion")).toBeInTheDocument();
  });

  test("restores all theme settings from the account panel", () => {
    render(<ThemeSettingsContent />);

    screen.getByRole("button", { name: "Restore defaults" }).click();

    expect(resetPreferences).toHaveBeenCalledOnce();
  });
});
