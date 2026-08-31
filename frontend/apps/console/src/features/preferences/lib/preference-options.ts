import type { DashboardFont, ThemePreset } from "@token-boat/app-core";

export const languageOptions = [
  { value: "zh", label: "简体中文" },
  { value: "en", label: "English" },
] as const;

export const themePresetOptions: ReadonlyArray<{ value: ThemePreset; label: string }> = [
  { value: "default", label: "Default" },
  { value: "brutalist", label: "Brutalist" },
  { value: "soft-pop", label: "Soft Pop" },
  { value: "tangerine", label: "Tangerine" },
];

export const fontOptions: ReadonlyArray<{ value: DashboardFont; label: string }> = [
  { value: "geist", label: "Geist" },
  { value: "inter", label: "Inter" },
  { value: "notoSans", label: "Noto Sans" },
  { value: "nunitoSans", label: "Nunito Sans" },
  { value: "figtree", label: "Figtree" },
  { value: "roboto", label: "Roboto" },
  { value: "raleway", label: "Raleway" },
  { value: "dmSans", label: "DM Sans" },
  { value: "publicSans", label: "Public Sans" },
  { value: "outfit", label: "Outfit" },
  { value: "geistMono", label: "Geist Mono" },
  { value: "geistPixelSquare", label: "Geist Pixel Square" },
  { value: "jetBrainsMono", label: "JetBrains Mono" },
  { value: "notoSerif", label: "Noto Serif" },
  { value: "robotoSlab", label: "Roboto Slab" },
  { value: "merriweather", label: "Merriweather" },
  { value: "lora", label: "Lora" },
  { value: "playfairDisplay", label: "Playfair Display" },
];
