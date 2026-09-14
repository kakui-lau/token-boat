import { hasViewerSession } from "@/islands/auth/viewer-session";

type ViewerSessionResolver = (forceRefresh?: boolean) => Promise<boolean>;

export function preserveLocationState(targetHref: string, currentHref: string): string {
  const currentUrl = new URL(currentHref);
  const targetUrl = new URL(targetHref, currentUrl);
  if (targetUrl.origin !== currentUrl.origin) return targetHref;

  targetUrl.search = currentUrl.search;
  targetUrl.hash = currentUrl.hash;
  return `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
}

export function initializeSiteHeader(
  root: Document = document,
  browserWindow: Window = window,
  resolveViewerSession: ViewerSessionResolver = hasViewerSession,
): () => void {
  const menus = Array.from(root.querySelectorAll<HTMLDetailsElement>("details[data-site-menu]"));
  const sessionLinks = Array.from(
    root.querySelectorAll<HTMLAnchorElement>("a[data-session-link]"),
  ).map((link) => {
    const labelElement = link.querySelector<HTMLElement>("[data-session-label]");
    return {
      anonymousHref: link.getAttribute("href"),
      anonymousLabel: labelElement?.textContent ?? null,
      labelElement,
      link,
    };
  });
  const closingDetails = new WeakMap<HTMLDetailsElement, number>();
  let sessionCheckVersion = 0;
  let disposed = false;

  const closeMenu = (menu: HTMLDetailsElement, restoreFocus = false) => {
    const timer = closingDetails.get(menu);
    if (timer !== undefined) browserWindow.clearTimeout(timer);
    closingDetails.delete(menu);
    delete menu.dataset.closing;
    delete menu.dataset.instant;
    menu.open = false;
    if (restoreFocus) menu.querySelector<HTMLElement>("summary")?.focus();
  };

  const toggleHandlers = new Map<HTMLDetailsElement, () => void>();
  for (const menu of menus) {
    const handleToggle = () => {
      if (!menu.open) return;
      for (const otherMenu of menus) {
        if (otherMenu !== menu) closeMenu(otherMenu);
      }
    };
    toggleHandlers.set(menu, handleToggle);
    menu.addEventListener("toggle", handleToggle);
  }

  for (const link of root.querySelectorAll<HTMLAnchorElement>("a[data-language-link]")) {
    const targetHref = link.getAttribute("href");
    if (targetHref) {
      link.setAttribute("href", preserveLocationState(targetHref, browserWindow.location.href));
    }
  }

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const languageLink = target.closest<HTMLAnchorElement>("a[data-language-link]");
    if (languageLink) {
      const targetHref = languageLink.getAttribute("href");
      if (targetHref) {
        languageLink.setAttribute(
          "href",
          preserveLocationState(targetHref, browserWindow.location.href),
        );
      }
    }
    const summary = target.closest("summary");
    const menu = summary?.parentElement;
    if (menu && menus.includes(menu as HTMLDetailsElement)) {
      const details = menu as HTMLDetailsElement;
      if (event.detail === 0) {
        details.dataset.instant = "true";
        browserWindow.setTimeout(() => delete details.dataset.instant, 50);
        return;
      }

      const existingTimer = closingDetails.get(details);
      if (existingTimer !== undefined) {
        event.preventDefault();
        browserWindow.clearTimeout(existingTimer);
        closingDetails.delete(details);
        delete details.dataset.closing;
        return;
      }

      if (!details.open || browserWindow.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      event.preventDefault();
      details.dataset.closing = "true";
      const timer = browserWindow.setTimeout(() => {
        details.open = false;
        delete details.dataset.closing;
        closingDetails.delete(details);
      }, 140);
      closingDetails.set(details, timer);
      return;
    }

    if (menus.some((candidate) => candidate.contains(target))) return;
    for (const candidate of menus) closeMenu(candidate);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    const openMenu = menus.find((menu) => menu.open);
    if (!openMenu) return;
    event.preventDefault();
    for (const menu of menus) closeMenu(menu);
    openMenu.querySelector<HTMLElement>("summary")?.focus();
  };

  const updateSessionLinks = (forceRefresh = false) => {
    const checkVersion = ++sessionCheckVersion;
    void resolveViewerSession(forceRefresh)
      .then((authenticated) => {
        if (disposed || checkVersion !== sessionCheckVersion) return;
        for (const sessionLink of sessionLinks) {
          const href = authenticated
            ? sessionLink.link.dataset.authenticatedHref
            : sessionLink.anonymousHref;
          const label = authenticated
            ? sessionLink.link.dataset.authenticatedLabel
            : sessionLink.anonymousLabel;
          if (href) sessionLink.link.setAttribute("href", href);
          if (label && sessionLink.labelElement) sessionLink.labelElement.textContent = label;
        }
      })
      .catch(() => undefined);
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) updateSessionLinks(true);
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("keydown", handleKeydown);
  browserWindow.addEventListener("pageshow", handlePageShow);
  updateSessionLinks();

  return () => {
    disposed = true;
    root.removeEventListener("click", handleClick);
    root.removeEventListener("keydown", handleKeydown);
    browserWindow.removeEventListener("pageshow", handlePageShow);
    for (const menu of menus) {
      const timer = closingDetails.get(menu);
      if (timer !== undefined) browserWindow.clearTimeout(timer);
      const handleToggle = toggleHandlers.get(menu);
      if (handleToggle) menu.removeEventListener("toggle", handleToggle);
    }
  };
}
