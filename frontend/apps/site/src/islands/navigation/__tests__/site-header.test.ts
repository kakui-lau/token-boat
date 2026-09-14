// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { initializeSiteHeader, preserveLocationState } from "@/islands/navigation/site-header";

describe("site header navigation", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    window.history.replaceState({}, "", "/models?model=moonshotai%2Fkimi-k3#catalog");
    document.body.innerHTML = `
      <details data-site-menu="language">
        <summary>Language</summary>
        <a data-language-link href="/en/models">English</a>
      </details>
      <details data-site-menu="navigation">
        <summary>Navigation</summary>
        <a href="/docs">Docs</a>
      </details>
      <button id="outside" type="button">Outside</button>
    `;
    cleanup = initializeSiteHeader();
  });

  afterEach(() => {
    cleanup?.();
    document.body.replaceChildren();
  });

  test("keeps the query and hash when switching language", () => {
    const link = document.querySelector<HTMLAnchorElement>("[data-language-link]");

    expect(link?.getAttribute("href")).toBe("/en/models?model=moonshotai%2Fkimi-k3#catalog");
    expect(preserveLocationState("https://example.com/en", window.location.href)).toBe(
      "https://example.com/en",
    );

    window.history.replaceState({}, "", "/models?family=video#results");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(link?.getAttribute("href")).toBe("/en/models?family=video#results");
  });

  test("keeps the language and navigation menus mutually exclusive", () => {
    const language = document.querySelector<HTMLDetailsElement>('[data-site-menu="language"]')!;
    const navigation = document.querySelector<HTMLDetailsElement>('[data-site-menu="navigation"]')!;
    language.open = true;
    language.dispatchEvent(new Event("toggle"));

    navigation.open = true;
    navigation.dispatchEvent(new Event("toggle"));

    expect(navigation.open).toBe(true);
    expect(language.open).toBe(false);
  });

  test("closes an open menu when clicking outside", () => {
    const language = document.querySelector<HTMLDetailsElement>('[data-site-menu="language"]')!;
    language.open = true;

    document.querySelector<HTMLButtonElement>("#outside")!.click();

    expect(language.open).toBe(false);
  });

  test("closes an open menu on Escape and restores summary focus", () => {
    const navigation = document.querySelector<HTMLDetailsElement>('[data-site-menu="navigation"]')!;
    const summary = navigation.querySelector<HTMLElement>("summary")!;
    navigation.open = true;

    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));

    expect(navigation.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
