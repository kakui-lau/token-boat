import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("viewer session", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("forces a server check when a cached session may have signed out", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("access-token"))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const { hasViewerSession } = await import("@/islands/auth/viewer-session");

    await expect(hasViewerSession()).resolves.toBe(true);
    await expect(hasViewerSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(hasViewerSession(true)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("waits for an in-flight check and then starts a newer forced check", async () => {
    let resolveInitialRefresh: ((response: Response) => void) | undefined;
    const initialRefresh = new Promise<Response>((resolve) => {
      resolveInitialRefresh = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(initialRefresh)
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const { hasViewerSession } = await import("@/islands/auth/viewer-session");
    const initialCheck = hasViewerSession();
    const forcedCheck = hasViewerSession(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    resolveInitialRefresh?.(authResponse("stale-access-token"));

    await expect(initialCheck).resolves.toBe(true);
    await expect(forcedCheck).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function authResponse(accessToken: string): Response {
  return jsonResponse({
    data: {
      access_expires_at: Math.floor(Date.now() / 1000) + 600,
      access_token: accessToken,
      session: { current: true, sid: "session-id" },
      token_type: "Bearer",
    },
    success: true,
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
