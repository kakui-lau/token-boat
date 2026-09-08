import { describe, expect, test } from "vitest";

import {
  mapAdminRequestWorkspace,
  requestListSearch,
  requestStatSearch,
} from "../admin-request-mappers";
import { mapAdminTaskPage, mapAdminTaskRefundResult, taskListSearch } from "../admin-task-mappers";
import type { AdminRequestListInput, AdminTaskListInput, AdminTimeRange } from "../contracts";

const range: AdminTimeRange = {
  endTimestamp: 1_800,
  preset: "1h",
  startTimestamp: 1_200,
  timeZone: "UTC",
};

test("request queries preserve the bounded time range and server-side request scope", () => {
  const input: AdminRequestListInput = {
    keyword: "alice",
    order: "asc",
    page: 3,
    pageSize: 25,
    range,
    searchField: "username",
    status: "all",
  };

  expect(Object.fromEntries(requestListSearch(input))).toEqual({
    end_timestamp: "1800",
    order: "asc",
    p: "3",
    page_size: "25",
    scope: "request",
    start_timestamp: "1200",
    username: "%alice%",
  });
  expect(Object.fromEntries(requestStatSearch(input))).toEqual({
    end_timestamp: "1800",
    scope: "request",
    start_timestamp: "1200",
    username: "%alice%",
  });
});

test("request responses expose a safe USD-denominated projection", () => {
  const workspace = mapAdminRequestWorkspace(
    {
      items: [
        {
          api_key_name: "Production",
          channel_id: 9,
          channel_name: "Primary",
          completion_tokens: 20,
          cost_usd: 0,
          created_at: 1_700_000_000,
          endpoint: "/v1/responses",
          error_code: "timeout",
          error_message: "provider timeout",
          first_token_latency_ms: 40,
          group: "default",
          id: 44,
          is_stream: true,
          latency_ms: 250,
          model_name: "model-a",
          prompt_tokens: 100,
          request_id: "request-44",
          source_ip: "203.0.113.4",
          type: 5,
          upstream_request_id: "trace-44",
          username: "alice",
        },
      ],
      page: 1,
      page_size: 25,
      total: 1,
    },
    {
      cache_hit_rate: 0.2,
      cost_usd: 1.5,
      failure_count: 1,
      failure_rate: 1 / 3,
      peak_rpm: 8,
      peak_tpm: 640,
      request_count: 2,
      total_tokens: 120,
    },
    { page: 1, pageSize: 25 },
  );

  expect(workspace.summary).toMatchObject({
    costUsd: 1.5,
    failedCount: 1,
    requestCount: 3,
    succeededCount: 2,
  });
  expect(workspace.items[0]).toMatchObject({
    costUsd: 0,
    endpoint: "/v1/responses",
    errorCode: "timeout",
    latencyMs: 250,
    status: "failed",
  });
  expect(workspace.items[0]).not.toHaveProperty("other");
  expect(workspace.items[0]).not.toHaveProperty("quota");
  expect(workspace.items[0]).not.toHaveProperty("tokenId");
});

describe("administrator task mapping", () => {
  const input: AdminTaskListInput = {
    channelId: "9",
    keyword: "task-42",
    order: "desc",
    page: 1,
    pageSize: 20,
    range,
    status: "processing",
    type: "video",
  };

  test("sends only supported task filters", () => {
    expect(Object.fromEntries(taskListSearch(input))).toEqual({
      channel_id: "9",
      end_timestamp: "1800",
      order: "desc",
      p: "1",
      page_size: "20",
      start_timestamp: "1200",
      status_group: "processing",
      task_id: "task-42",
      task_type: "video",
      view: "summary",
    });
  });

  test("maps server-denominated task USD without exposing upstream payloads", () => {
    const page = mapAdminTaskPage(
      {
        items: [
          {
            action: "generate",
            admin_billing: {
              billing_audit_status: "verified",
              refund_quota: 50_000,
              refunded_usd: 0.125,
              refund_status: "pending",
              settlement_status: "completed",
              settlement_target_quota: 250_000,
              settlement_target_usd: 0.625,
            },
            admin_upstream_request: { body: "secret prompt", method: "POST" },
            channel_id: 9,
            cost_usd: 1.75,
            created_at: 1_700_000_000,
            data: { model: "seedance-2.0" },
            fail_reason: "",
            group: "default",
            id: 1,
            model: "seedance-2.0",
            platform: "byteplus-video",
            progress: "46%",
            prompt_preview: "A boat crossing the sea",
            quota: 500_000,
            start_time: 1_700_000_010,
            status: "IN_PROGRESS",
            task_id: "task-42",
            task_type: "video",
            user_id: 7,
            username: "alice",
          },
        ],
        page: 1,
        page_size: 20,
        total: 1,
      },
      input,
    );

    expect(page.items[0]).toMatchObject({
      canFailAndRefund: true,
      costUsd: 1.75,
      id: 1,
      model: "seedance-2.0",
      progress: 46,
      status: "processing",
      taskId: "task-42",
      type: "video",
    });
    expect(page.items[0]?.billing).toMatchObject({
      refundedUsd: 0.125,
      settlementTargetUsd: 0.625,
    });
    expect(JSON.stringify(page)).not.toContain("secret prompt");
  });

  test("preserves unavailable historical task USD as null instead of using raw quota", () => {
    const task = mapAdminTaskPage(
      {
        items: [
          {
            admin_billing: {
              refund_quota: 50_000,
              refunded_usd: null,
              settlement_target_quota: 250_000,
              settlement_target_usd: null,
            },
            cost_usd: null,
            created_at: 1_700_000_000,
            id: 3,
            quota: 500_000,
          },
        ],
        total: 1,
      },
      input,
    ).items[0];

    expect(task?.costUsd).toBeNull();
    expect(task?.billing).toMatchObject({ refundedUsd: null, settlementTargetUsd: null });
  });

  test("allows failed refund recovery but never posts an internal database ID", () => {
    const base = {
      admin_billing: { refund_status: "pending" },
      channel_id: 9,
      created_at: 1_700_000_000,
      id: 2,
      model: "seedance-2.0",
      platform: "byteplus-video",
      progress: "100%",
      quota: 500_000,
      status: "FAILURE",
      task_type: "video",
      user_id: 7,
    };

    const recoverable = mapAdminTaskPage(
      { items: [{ ...base, task_id: "task-failed" }], total: 1 },
      input,
    ).items[0];
    const legacyWithoutPublicId = mapAdminTaskPage(
      { items: [{ ...base, task_id: "" }], total: 1 },
      input,
    ).items[0];

    expect(recoverable).toMatchObject({ canFailAndRefund: true, taskId: "task-failed" });
    expect(legacyWithoutPublicId).toMatchObject({ canFailAndRefund: false, id: 2, taskId: null });
  });

  test("maps the server-denominated audited refund result and ignores raw quota", () => {
    expect(
      mapAdminTaskRefundResult({
        already_refunded: false,
        refunded_quota: 125_000,
        refunded_usd: 0.375,
        task_id: "task-42",
      }),
    ).toEqual({ alreadyRefunded: false, refundedUsd: 0.375, taskId: "task-42" });
  });

  test("preserves an unavailable audited refund USD amount as null", () => {
    expect(
      mapAdminTaskRefundResult({
        already_refunded: false,
        refunded_quota: 125_000,
        refunded_usd: null,
        task_id: "task-42",
      }),
    ).toEqual({ alreadyRefunded: false, refundedUsd: null, taskId: "task-42" });
  });
});
