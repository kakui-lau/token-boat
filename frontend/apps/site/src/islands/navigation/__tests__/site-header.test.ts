// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
        <a
          id="mobile-session-link"
          data-session-link
          data-authenticated-href="/console/"
          data-authenticated-label="Console"
          href="/console/sign-in"
        ><span>07</span><strong data-session-label>Sign in</strong></a>
      </details>
      <a
        id="desktop-session-link"
        data-session-link
        data-authenticated-href="/console/"
        data-authenticated-label="Console"
        href="/console/sign-in"
      ><span data-session-label>Sign in</span></a>
      <button id="outside" type="button">Outside</button>
    `;
    cleanup = initializeSiteHeader(document, window, async () => false);
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

  test("replaces sign-in links with console links for an authenticated viewer", async () => {
    cleanup?.();
    cleanup = initializeSiteHeader(document, window, async () => true);

    await vi.waitFor(() => {
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Console");
      expect(document.querySelector("#mobile-session-link")?.textContent).toBe("07Console");
    });

    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe("/console/");
    expect(document.querySelector("#mobile-session-link")?.getAttribute("href")).toBe("/console/");
  });

  test("keeps sign-in links for an anonymous viewer", async () => {
    await vi.waitFor(() => {
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Sign in");
      expect(document.querySelector("#mobile-session-link")?.textContent).toBe("07Sign in");
    });

    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe(
      "/console/sign-in",
    );
    expect(document.querySelector("#mobile-session-link")?.getAttribute("href")).toBe(
      "/console/sign-in",
    );
  });

  test("keeps sign-in links when session detection is unavailable", async () => {
    cleanup?.();
    const resolveSession = vi.fn().mockRejectedValue(new Error("session service unavailable"));
    cleanup = initializeSiteHeader(document, window, resolveSession);

    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledOnce());

    expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Sign in");
    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe(
      "/console/sign-in",
    );
  });

  test("refreshes an anonymous header after returning from sign-in history", async () => {
    cleanup?.();
    const resolveSession = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    cleanup = initializeSiteHeader(document, window, resolveSession);

    await vi.waitFor(() => expect(resolveSession).toHaveBeenCalledOnce());
    expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Sign in");

    const pageShowEvent = new Event("pageshow");
    Object.defineProperty(pageShowEvent, "persisted", { value: true });
    window.dispatchEvent(pageShowEvent);

    await vi.waitFor(() => {
      expect(resolveSession).toHaveBeenCalledTimes(2);
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Console");
    });
    expect(resolveSession).toHaveBeenLastCalledWith(true);
    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe("/console/");
  });

  test("restores sign-in links after a cached page observes a signed-out session", async () => {
    cleanup?.();
    const resolveSession = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    cleanup = initializeSiteHeader(document, window, resolveSession);

    await vi.waitFor(() => {
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Console");
    });

    const pageShowEvent = new Event("pageshow");
    Object.defineProperty(pageShowEvent, "persisted", { value: true });
    window.dispatchEvent(pageShowEvent);

    await vi.waitFor(() => {
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Sign in");
    });
    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe(
      "/console/sign-in",
    );
  });

  test("ignores an older session result when a BFCache refresh finishes first", async () => {
    cleanup?.();
    let resolveInitialCheck: ((authenticated: boolean) => void) | undefined;
    const initialCheck = new Promise<boolean>((resolve) => {
      resolveInitialCheck = resolve;
    });
    const resolveSession = vi.fn().mockReturnValueOnce(initialCheck).mockResolvedValueOnce(true);
    cleanup = initializeSiteHeader(document, window, resolveSession);

    const pageShowEvent = new Event("pageshow");
    Object.defineProperty(pageShowEvent, "persisted", { value: true });
    window.dispatchEvent(pageShowEvent);

    await vi.waitFor(() => {
      expect(resolveSession).toHaveBeenCalledTimes(2);
      expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Console");
    });

    resolveInitialCheck?.(false);
    await initialCheck;
    expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Console");
  });

  test("does not update links after the header has been disposed", async () => {
    cleanup?.();
    let resolveSession: ((authenticated: boolean) => void) | undefined;
    const sessionResult = new Promise<boolean>((resolve) => {
      resolveSession = resolve;
    });
    const detectSession = vi.fn(() => sessionResult);
    cleanup = initializeSiteHeader(document, window, detectSession);
    await vi.waitFor(() => expect(detectSession).toHaveBeenCalledOnce());

    cleanup();
    resolveSession?.(true);
    await sessionResult;

    expect(document.querySelector("#desktop-session-link")?.textContent).toBe("Sign in");
    expect(document.querySelector("#desktop-session-link")?.getAttribute("href")).toBe(
      "/console/sign-in",
    );
  });
});
