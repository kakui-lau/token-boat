const consoleRedirectOrigin = "https://console.invalid";
const guestRoutePaths = new Set([
  "/console/forgot-password",
  "/console/register",
  "/console/sign-in",
]);
const oauthRedirectStoragePrefix = "token_boat_console_oauth_redirect:";

export function normalizeConsoleRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const target = value.trim();
  if (!target || target.includes("\\") || target.startsWith("//")) return undefined;

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(target, consoleRedirectOrigin);
  } catch {
    return undefined;
  }

  if (redirectUrl.origin !== consoleRedirectOrigin) return undefined;
  if (redirectUrl.pathname !== "/console" && !redirectUrl.pathname.startsWith("/console/")) {
    return undefined;
  }
  if (guestRoutePaths.has(redirectUrl.pathname)) return undefined;

  return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
}

export function protectedConsoleRedirect(value: unknown): string | undefined {
  const redirect = normalizeConsoleRedirect(value);
  return redirect === "/console" || redirect === "/console/" ? undefined : redirect;
}

export function rememberOAuthRedirect(flowToken: string, redirect: unknown): void {
  const target = normalizeConsoleRedirect(redirect);
  if (!flowToken || !target) return;

  try {
    window.sessionStorage.setItem(`${oauthRedirectStoragePrefix}${flowToken}`, target);
  } catch {
    // Storage can be disabled by the browser. The OAuth flow still falls back to the overview.
  }
}

export function takeOAuthRedirect(flowToken: string): string | undefined {
  if (!flowToken) return undefined;

  try {
    const key = `${oauthRedirectStoragePrefix}${flowToken}`;
    const target = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return normalizeConsoleRedirect(target);
  } catch {
    return undefined;
  }
}
