import { ApiClientError, createApiClient } from "@token-boat/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";

describe("api client", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("keeps the bearer token in memory and includes credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "https://api.example.com" });
    client.setAccessToken("memory-token");

    await client.request({ path: "/api/user/self" });

    const requestCall = fetchMock.mock.calls[0];
    expect(requestCall).toBeDefined();
    const options = requestCall?.[1] as RequestInit;
    expect(options.cache).toBe("no-store");
    expect(options.credentials).toBe("include");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer memory-token");
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  test("accepts raw OpenAI-compatible playground responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "chatcmpl-1", choices: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const client = createApiClient();
    await expect(client.requestRaw({ path: "/pg/chat/completions" })).resolves.toMatchObject({
      id: "chatcmpl-1",
    });
  });

  test("preserves the real service request ID on API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, code: "SERVICE_UNAVAILABLE", message: "Unavailable" }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "X-Oneapi-Request-Id": "req-service-503",
            },
          },
        ),
      ),
    );
    const client = createApiClient();

    await expect(client.request({ path: "/api/user/self" })).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      requestId: "req-service-503",
    } satisfies Partial<ApiClientError>);
  });
});
