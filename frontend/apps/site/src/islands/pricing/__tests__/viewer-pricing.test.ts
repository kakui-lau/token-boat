import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe("viewer pricing requests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("shows official prices when no login session can be refreshed", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("official");
    expect(catalog.models[0]?.outputPrice?.amount).toBe(5);
    expect(catalog.models[0]?.priceAudience).toBe("official");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/user/auth/refresh",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        keepalive: true,
        method: "POST",
      }),
    );
    const pricingHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(pricingHeaders.has("Authorization")).toBe(false);
  });

  test("uses the signed-in account price only after a valid session refresh", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("account-access-token"))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ account: "2", official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("account");
    expect(catalog.models[0]?.outputPrice?.amount).toBe(2);
    expect(catalog.models[0]?.priceAudience).toBe("account");
    expect(catalog.officialModels[0]?.outputPrice?.amount).toBe(5);
    expect(catalog.officialModels[0]?.priceAudience).toBe("official");
    const pricingHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(pricingHeaders.get("Authorization")).toBe("Bearer account-access-token");
  });

  test("keeps the viewer signed in when a model only has an official price", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("account-access-token"))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("account");
    expect(catalog.models[0]?.priceAudience).toBe("official");
  });

  test("shows official pricing after a rejected access token confirms the session ended", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("expired-access-token"))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("official");
    expect(catalog.models[0]?.outputPrice?.amount).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fallbackHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(fallbackHeaders.has("Authorization")).toBe(false);
  });

  test("refreshes once more before downgrading a rejected account request", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("stale-access-token"))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401))
      .mockResolvedValueOnce(authResponse("replacement-access-token"))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ account: "2", official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("account");
    expect(catalog.models[0]?.outputPrice?.amount).toBe(2);
    const refreshHeaders = new Headers(fetchMock.mock.calls[2]?.[1]?.headers);
    expect(refreshHeaders.get("X-Auth-Session")).toBe("session-id");
    const replacementHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(replacementHeaders.get("Authorization")).toBe("Bearer replacement-access-token");
  });

  test("shows clearly degraded official pricing when session refresh is unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false }, 503))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("degraded");
    expect(catalog.models[0]?.priceAudience).toBe("official");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pricingHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(pricingHeaders.has("Authorization")).toBe(false);
  });

  test("falls back to degraded official pricing after a failed account pricing envelope", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(authResponse("account-access-token"))
      .mockResolvedValueOnce(jsonResponse({ success: false }))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const catalog = await fetchViewerPricing();

    expect(catalog.audience).toBe("degraded");
    expect(catalog.models[0]?.priceAudience).toBe("official");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("still rejects a failed official pricing envelope", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ success: false }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");

    await expect(fetchViewerPricing()).rejects.toThrow("invalid response");
  });

  test("shares one uninterruptible refresh across concurrent callers", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(refreshResponse)
      .mockResolvedValueOnce(pricingResponse([pricedModel({ account: "2", official: "5" })]))
      .mockResolvedValueOnce(pricingResponse([pricedModel({ account: "2", official: "5" })]));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const first = fetchViewerPricing();
    const second = fetchViewerPricing();
    resolveRefresh?.(authResponse("shared-access-token"));
    const catalogs = await Promise.all([first, second]);

    expect(catalogs.every((catalog) => catalog.audience === "account")).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/user/auth/refresh")).toHaveLength(
      1,
    );
  });

  test("caller abort does not cancel an in-flight refresh or start a pricing request", async () => {
    let resolveRefresh: ((response: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(refreshResponse);
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const { fetchViewerPricing } = await import("@/islands/pricing/viewer-pricing");
    const request = fetchViewerPricing(controller.signal);
    controller.abort();
    resolveRefresh?.(authResponse("account-access-token"));

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
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

function pricingResponse(models: unknown[]): Response {
  return jsonResponse({ data: models, success: true });
}

function pricedModel(prices: { account?: string; official: string }) {
  return {
    lowest_price: prices.account
      ? {
          currency: "USD",
          items: [{ amount: prices.account, component: "request", unit: "request" }],
        }
      : undefined,
    model_name: "provider/example",
    official_price: {
      currency: "USD",
      items: [{ amount: prices.official, component: "request", unit: "request" }],
    },
    pricing_source: "sales_price_book",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
