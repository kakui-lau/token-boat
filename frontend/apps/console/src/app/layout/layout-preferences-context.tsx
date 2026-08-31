import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useTheme } from "next-themes";

import {
  getDefaultLayoutPreferences,
  readLayoutPreferences,
  writeLayoutPreferences,
  type LayoutPreferences,
} from "@token-boat/app-core";

type LayoutPreferencesContextValue = {
  preferences: LayoutPreferences;
  updatePreferences(patch: Partial<Omit<LayoutPreferences, "version">>): void;
  resetPreferences(): void;
};

const LayoutPreferencesContext = createContext<LayoutPreferencesContextValue | null>(null);

export function LayoutPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(readLayoutPreferences);
  const { setTheme } = useTheme();

  useEffect(() => {
    writeLayoutPreferences(preferences);
    setTheme(preferences.themeMode);
    document.documentElement.dataset.themePreset = preferences.themePreset;
    document.documentElement.dataset.dashboardFont = preferences.font;
  }, [preferences, setTheme]);

  const updatePreferences = useCallback((patch: Partial<Omit<LayoutPreferences, "version">>) => {
    setPreferences((current) => ({ ...current, ...patch, version: 3 }));
  }, []);
  const resetPreferences = useCallback(() => {
    setPreferences(getDefaultLayoutPreferences());
  }, []);
  const value = useMemo(
    () => ({ preferences, updatePreferences, resetPreferences }),
    [preferences, resetPreferences, updatePreferences],
  );

  return (
    <LayoutPreferencesContext.Provider value={value}>{children}</LayoutPreferencesContext.Provider>
  );
}

export function useLayoutPreferences() {
  const value = useContext(LayoutPreferencesContext);
  if (!value) {
    throw new Error("useLayoutPreferences must be used within LayoutPreferencesProvider");
  }
  return value;
}
