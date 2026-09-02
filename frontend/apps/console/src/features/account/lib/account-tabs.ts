const accountTabs = ["profile", "preferences", "security", "sessions", "theme"] as const;

export type AccountTab = (typeof accountTabs)[number];

export function parseAccountSearch(search: Record<string, unknown>): { tab?: AccountTab } {
  const tab = search.tab;
  return {
    tab:
      typeof tab === "string" && accountTabs.includes(tab as AccountTab)
        ? (tab as AccountTab)
        : "profile",
  };
}
