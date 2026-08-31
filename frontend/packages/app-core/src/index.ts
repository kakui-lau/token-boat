export type ThemeMode = "light" | "dark" | "system";
export type ThemePreset = "default" | "brutalist" | "soft-pop" | "tangerine";
export type DashboardFont =
  | "geist"
  | "inter"
  | "notoSans"
  | "nunitoSans"
  | "figtree"
  | "roboto"
  | "raleway"
  | "dmSans"
  | "publicSans"
  | "outfit"
  | "geistMono"
  | "geistPixelSquare"
  | "jetBrainsMono"
  | "notoSerif"
  | "robotoSlab"
  | "merriweather"
  | "lora"
  | "playfairDisplay";
export type ContentLayout = "centered" | "full-width";
export type NavbarStyle = "sticky" | "scroll";
export type SidebarVariant = "sidebar" | "inset" | "floating";
export type SidebarCollapsible = "icon" | "offcanvas";
export type DashboardDensity = "comfortable" | "compact";

export type LayoutPreferences = {
  version: 3;
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  font: DashboardFont;
  contentLayout: ContentLayout;
  navbarStyle: NavbarStyle;
  sidebarVariant: SidebarVariant;
  sidebarCollapsible: SidebarCollapsible;
  sidebarCollapsed: boolean;
  density: DashboardDensity;
  reducedMotion: boolean;
};

const layoutPreferencesKey = "console_layout_preferences_v3";
const versionTwoLayoutPreferencesKey = "console_layout_preferences_v2";
const versionOneLayoutPreferencesKey = "console_layout_preferences_v1";

const themeModes = new Set<ThemeMode>(["light", "dark", "system"]);
const themePresets = new Set<ThemePreset>(["default", "brutalist", "soft-pop", "tangerine"]);
const fonts = new Set<DashboardFont>([
  "geist",
  "inter",
  "notoSans",
  "nunitoSans",
  "figtree",
  "roboto",
  "raleway",
  "dmSans",
  "publicSans",
  "outfit",
  "geistMono",
  "geistPixelSquare",
  "jetBrainsMono",
  "notoSerif",
  "robotoSlab",
  "merriweather",
  "lora",
  "playfairDisplay",
]);
const contentLayouts = new Set<ContentLayout>(["centered", "full-width"]);
const navbarStyles = new Set<NavbarStyle>(["sticky", "scroll"]);
const sidebarVariants = new Set<SidebarVariant>(["sidebar", "inset", "floating"]);
const sidebarCollapsibles = new Set<SidebarCollapsible>(["icon", "offcanvas"]);
const densities = new Set<DashboardDensity>(["comfortable", "compact"]);

export function getDefaultLayoutPreferences(): LayoutPreferences {
  return {
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
  };
}

export function readLayoutPreferences(): LayoutPreferences {
  const fallback = getDefaultLayoutPreferences();

  try {
    const value = window.localStorage.getItem(layoutPreferencesKey);
    if (value) {
      const parsed = JSON.parse(value) as Partial<LayoutPreferences>;
      if (
        parsed.version === 3 &&
        themeModes.has(parsed.themeMode as ThemeMode) &&
        themePresets.has(parsed.themePreset as ThemePreset) &&
        fonts.has(parsed.font as DashboardFont) &&
        contentLayouts.has(parsed.contentLayout as ContentLayout) &&
        navbarStyles.has(parsed.navbarStyle as NavbarStyle) &&
        sidebarVariants.has(parsed.sidebarVariant as SidebarVariant) &&
        sidebarCollapsibles.has(parsed.sidebarCollapsible as SidebarCollapsible) &&
        typeof parsed.sidebarCollapsed === "boolean" &&
        densities.has(parsed.density as DashboardDensity) &&
        typeof parsed.reducedMotion === "boolean"
      ) {
        return parsed as LayoutPreferences;
      }
      return fallback;
    }

    const versionTwoValue = window.localStorage.getItem(versionTwoLayoutPreferencesKey);
    if (versionTwoValue) {
      const parsed = JSON.parse(versionTwoValue) as {
        version?: number;
        sidebarCollapsed?: unknown;
        contentLayout?: unknown;
        density?: unknown;
        stickyHeader?: unknown;
        reducedMotion?: unknown;
      };
      if (
        parsed.version === 2 &&
        typeof parsed.sidebarCollapsed === "boolean" &&
        contentLayouts.has(parsed.contentLayout as ContentLayout) &&
        densities.has(parsed.density as DashboardDensity) &&
        typeof parsed.stickyHeader === "boolean" &&
        typeof parsed.reducedMotion === "boolean"
      ) {
        return {
          ...fallback,
          sidebarCollapsed: parsed.sidebarCollapsed,
          contentLayout: parsed.contentLayout as ContentLayout,
          density: parsed.density as DashboardDensity,
          navbarStyle: parsed.stickyHeader ? "sticky" : "scroll",
          reducedMotion: parsed.reducedMotion,
        };
      }
      return fallback;
    }

    const versionOneValue = window.localStorage.getItem(versionOneLayoutPreferencesKey);
    if (!versionOneValue) return fallback;
    const parsed = JSON.parse(versionOneValue) as {
      version?: number;
      sidebarCollapsed?: unknown;
    };
    if (parsed.version !== 1 || typeof parsed.sidebarCollapsed !== "boolean") return fallback;
    return { ...fallback, sidebarCollapsed: parsed.sidebarCollapsed };
  } catch {
    return fallback;
  }
}

export function writeLayoutPreferences(preferences: LayoutPreferences) {
  try {
    window.localStorage.setItem(layoutPreferencesKey, JSON.stringify(preferences));
  } catch {
    // Browsers can deny storage access. The in-memory preference still works.
  }
}
