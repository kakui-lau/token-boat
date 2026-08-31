import { beforeEach, describe, expect, it, vi } from "vitest";

describe("console default language", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("starts in Simplified Chinese when the user has no saved language", async () => {
    const { i18n, i18nReady } = await import("../index");

    await i18nReady;

    expect(i18n.resolvedLanguage).toBe("zh");
    expect(document.documentElement.lang).toBe("zh");
  });

  it("exposes only English and Simplified Chinese", async () => {
    const { i18n, i18nReady } = await import("../index");

    await i18nReady;

    expect(i18n.options.supportedLngs).toContain("en");
    expect(i18n.options.supportedLngs).toContain("zh");
    expect(i18n.options.supportedLngs).not.toContain("zh-TW");
    expect(i18n.options.supportedLngs).not.toContain("fr");
    expect(i18n.options.supportedLngs).not.toContain("ja");
    expect(i18n.options.supportedLngs).not.toContain("ru");
    expect(i18n.options.supportedLngs).not.toContain("vi");
  });
});
