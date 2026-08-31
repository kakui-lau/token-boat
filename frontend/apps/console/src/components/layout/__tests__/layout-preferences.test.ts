import { beforeEach, describe, expect, it } from "vitest";

import {
  getDefaultLayoutPreferences,
  readLayoutPreferences,
  writeLayoutPreferences,
} from "@token-boat/app-core";

describe("User Console layout preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the complete dashboard defaults when no preference exists", () => {
    expect(readLayoutPreferences()).toEqual(getDefaultLayoutPreferences());
  });

  it("persists the complete versioned layout state", () => {
    const preferences = {
      ...getDefaultLayoutPreferences(),
      sidebarCollapsed: true,
      contentLayout: "full-width" as const,
      density: "compact" as const,
      navbarStyle: "scroll" as const,
      sidebarVariant: "floating" as const,
      sidebarCollapsible: "offcanvas" as const,
      themeMode: "dark" as const,
      themePreset: "tangerine" as const,
      font: "jetBrainsMono" as const,
      reducedMotion: true,
    };
    writeLayoutPreferences(preferences);

    expect(readLayoutPreferences()).toEqual(preferences);
  });

  it("migrates version two layout values into the expanded preference model", () => {
    window.localStorage.setItem(
      "console_layout_preferences_v2",
      JSON.stringify({
        version: 2,
        sidebarCollapsed: true,
        contentLayout: "full-width",
        density: "compact",
        stickyHeader: false,
        reducedMotion: true,
      }),
    );

    expect(readLayoutPreferences()).toEqual({
      ...getDefaultLayoutPreferences(),
      sidebarCollapsed: true,
      contentLayout: "full-width",
      density: "compact",
      navbarStyle: "scroll",
      reducedMotion: true,
    });
  });

  it("migrates the version one collapsed state into the new defaults", () => {
    window.localStorage.setItem(
      "console_layout_preferences_v1",
      JSON.stringify({ version: 1, sidebarCollapsed: true }),
    );

    expect(readLayoutPreferences()).toEqual({
      ...getDefaultLayoutPreferences(),
      sidebarCollapsed: true,
    });
  });

  it("ignores incompatible version three values", () => {
    window.localStorage.setItem(
      "console_layout_preferences_v3",
      JSON.stringify({ version: 3, sidebarCollapsed: true, contentLayout: "unknown" }),
    );

    expect(readLayoutPreferences()).toEqual(getDefaultLayoutPreferences());
  });
});
