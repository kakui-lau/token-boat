import { afterEach, describe, expect, test, vi } from "vitest";

import { AdminAccessDeniedError, createAdminRepository } from "../admin-repository";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin repository contracts", () => {
  test("bootstraps an administrator session before reading sanitized channel data", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            access_token: "admin-token",
            access_expires_at: 1_800_000_000,
            user: {
              id: 7,
              role: 10,
              username: "operator",
              display_name: "Ops",
              permissions: {
                admin_permissions: {
                  channel: { operate: true, read: true },
                  finance: { operate: false, read: true },
                },
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            items: [
              {
                id: 12,
                type: 14,
                status: 1,
                name: "anthropic-primary",
                weight: 10,
                test_time: 1_700_000_000,
                response_time: 932,
                base_url: "https://api.example.com",
                balance: 48.25,
                models: "claude-sonnet,claude-haiku",
                group: "default",
                priority: 2,
                tag: "primary",
              },
            ],
            page: 1,
            page_size: 20,
            total: 1,
            type_counts: { 14: 1 },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const repository = createAdminRepository();

    const session = await repository.getSession();
    const channels = await repository.listChannels({
      keyword: "anthropic",
      page: 1,
      pageSize: 20,
      status: "enabled",
    });

    expect(session?.user).toMatchObject({ id: 7, role: 10, username: "operator" });
    expect(session?.user.adminPermissions).toEqual({
      channel: { operate: true, read: true },
      finance: { operate: false, read: true },
    });
    expect(channels).toEqual({
      items: [
        {
          balanceUsd: 48.25,
          baseUrl: "https://api.example.com",
          group: "default",
          id: 12,
          modelCount: 2,
          name: "anthropic-primary",
          priority: 2,
          responseTimeMs: 932,
          status: 1,
          tag: "primary",
          testTime: 1_700_000_000,
          type: 14,
          weight: 10,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      typeCounts: { 14: 1 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/user/auth/refresh");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/channel/search?p=1&page_size=20&view=summary&keyword=anthropic&status=enabled",
    );
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer admin-token",
    );
  });

  test("fails closed when a signed-in account is not an administrator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            access_token: "user-token",
            access_expires_at: 1_800_000_000,
            user: { id: 8, role: 1, username: "member" },
          },
        }),
      ),
    );

    await expect(createAdminRepository().getSession()).rejects.toBeInstanceOf(
      AdminAccessDeniedError,
    );
  });

  test("uses the audited status endpoint instead of the general channel update contract", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true, data: true }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdminRepository().setChannelStatus(42, 2);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/channel/42/status");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ status: 2 }),
      method: "POST",
    });
  });

  test("loads a request workspace with request-only scope and server-denominated USD", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = String(input);
      if (url.startsWith("/api/log/?")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              items: [
                {
                  created_at: 1_700_000_000,
                  cost_usd: 0.5,
                  id: 7,
                  request_id: "request-7",
                  type: 2,
                  username: "alice",
                },
              ],
              page: 1,
              page_size: 20,
              total: 1,
            },
          }),
        );
      }
      if (url.startsWith("/api/log/stat?")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            data: {
              failure_count: 0,
              failure_rate: 0,
              cost_usd: 0.5,
              peak_rpm: 1,
              peak_tpm: 0,
              request_count: 1,
              total_tokens: 0,
            },
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const workspace = await createAdminRepository().getRequestWorkspace({
      keyword: "request-7",
      order: "desc",
      page: 1,
      pageSize: 20,
      range: {
        endTimestamp: 1_700_000_600,
        preset: "custom",
        startTimestamp: 1_700_000_000,
        timeZone: "UTC",
      },
      searchField: "request",
      status: "all",
    });

    expect(workspace.items[0]?.costUsd).toBe(0.5);
    expect(workspace.summary.costUsd).toBe(0.5);
    const listUrl = String(
      fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/log/?"))?.[0],
    );
    const listSearch = new URL(listUrl, "https://admin.test").searchParams;
    expect(Object.fromEntries(listSearch)).toMatchObject({
      end_timestamp: "1700000600",
      order: "desc",
      request_id: "request-7",
      scope: "request",
      start_timestamp: "1700000000",
    });
  });

  test("loads tasks with historical USD and does not request the live quota rate", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              admin_billing: {
                refunded_usd: 0.125,
                settlement_target_usd: 0.75,
              },
              cost_usd: 0.5,
              created_at: 1_700_000_000,
              id: 42,
              task_id: "task-42",
            },
          ],
          page: 1,
          page_size: 20,
          total: 1,
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tasks = await createAdminRepository().listTasks({
      channelId: "",
      keyword: "task-42",
      order: "desc",
      page: 1,
      pageSize: 20,
      range: {
        endTimestamp: 1_700_000_600,
        preset: "custom",
        startTimestamp: 1_700_000_000,
        timeZone: "UTC",
      },
      status: "all",
      type: "all",
    });

    expect(tasks.items[0]).toMatchObject({
      billing: { refundedUsd: 0.125, settlementTargetUsd: 0.75 },
      costUsd: 0.5,
      taskId: "task-42",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/task/?");
  });

  test("uses the audited refund USD and does not request the live quota rate", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          already_refunded: false,
          refunded_quota: 125_000,
          refunded_usd: 0.25,
          task_id: "task/42",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAdminRepository().failAndRefundTask(42, "task/42")).resolves.toEqual({
      alreadyRefunded: false,
      refundedUsd: 0.25,
      taskId: "task/42",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/task/task%2F42/fail-and-refund");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ internal_id: 42 });
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
