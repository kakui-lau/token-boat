import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { LayoutPreferencesProvider, useLayoutPreferences } from "../layout-preferences-context";

function PreferencesProbe() {
  const { preferences, resetPreferences, updatePreferences } = useLayoutPreferences();
  return (
    <div>
      <output>{`${preferences.contentLayout}:${preferences.density}:${preferences.navbarStyle}:${preferences.themePreset}`}</output>
      <button
        onClick={() =>
          updatePreferences({
            contentLayout: "full-width",
            density: "compact",
            navbarStyle: "scroll",
            themePreset: "tangerine",
          })
        }
        type="button"
      >
        Update layout
      </button>
      <button onClick={resetPreferences} type="button">
        Reset layout
      </button>
    </div>
  );
}

describe("LayoutPreferencesProvider", () => {
  beforeEach(() => window.localStorage.clear());

  test("applies changes immediately and persists the complete preference", async () => {
    render(
      <LayoutPreferencesProvider>
        <PreferencesProbe />
      </LayoutPreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update layout" }));
    expect(screen.getByText("full-width:compact:scroll:tangerine")).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem("console_layout_preferences_v3")).toContain("full-width"),
    );
    expect(document.documentElement.dataset.themePreset).toBe("tangerine");
  });

  test("restores dashboard defaults", () => {
    render(
      <LayoutPreferencesProvider>
        <PreferencesProbe />
      </LayoutPreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Update layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(screen.getByText("centered:comfortable:sticky:default")).toBeInTheDocument();
  });
});
