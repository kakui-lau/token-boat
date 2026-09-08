import { ApiClientError, createApiClient, type ApiClient } from "@token-boat/api-client";

import {
  ADMIN_ROLE,
  type AdminChannel,
  type AdminChannelPage,
  type AdminPermissionMap,
  type AdminRepository,
  type AdminSession,
  type ChannelListInput,
  type ChannelStatus,
  type ChannelTestResult,
} from "./contracts";
import {
  mapAdminRequestWorkspace,
  requestListSearch,
  requestStatSearch,
} from "./admin-request-mappers";
import { mapAdminTaskPage, mapAdminTaskRefundResult, taskListSearch } from "./admin-task-mappers";

const channelStatuses = new Set([0, 1, 2, 3]);

export class AdminAccessDeniedError extends Error {
  constructor() {
    super("Administrator access is required.");
    this.name = "AdminAccessDeniedError";
  }
}

export function createAdminRepository(
  client: ApiClient = createApiClient({ baseUrl: import.meta.env.VITE_ADMIN_API_BASE_URL }),
): AdminRepository {
  return {
    async getSession(signal) {
      try {
        const response = await client.request<unknown>({
          authenticated: false,
          method: "POST",
          path: "/api/user/auth/refresh",
          signal,
        });
        const session = mapAdminSession(response.data);
        if (session.user.role < ADMIN_ROLE) throw new AdminAccessDeniedError();
        client.setAccessToken(session.accessToken);
        return session;
      } catch (error) {
        client.clearAccessToken();
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          return null;
        }
        throw error;
      }
    },

    async listChannels(input, signal) {
      const query = channelListQuery(input);
      const response = await client.request<unknown>({
        path: `/api/channel${input.keyword ? "/search" : ""}?${query}`,
        signal,
      });
      return mapAdminChannelPage(response.data, input);
    },

    async getRequestWorkspace(input, signal) {
      const listSearch = requestListSearch(input);
      const statSearch = requestStatSearch(input);
      const [pageResponse, statResponse] = await Promise.all([
        client.request<unknown>({ path: `/api/log/?${listSearch.toString()}`, signal }),
        client.request<unknown>({ path: `/api/log/stat?${statSearch.toString()}`, signal }),
      ]);
      return mapAdminRequestWorkspace(pageResponse.data, statResponse.data, input);
    },

    async listTasks(input, signal) {
      const response = await client.request<unknown>({
        path: `/api/task/?${taskListSearch(input).toString()}`,
        signal,
      });
      return mapAdminTaskPage(response.data, input);
    },

    async failAndRefundTask(internalId, taskId) {
      if (!Number.isSafeInteger(internalId) || internalId <= 0) {
        throw new Error("Valid internal task ID is required.");
      }
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId) throw new Error("Task ID is required.");
      const response = await client.request<unknown>({
        body: { internal_id: internalId },
        method: "POST",
        path: `/api/task/${encodeURIComponent(normalizedTaskId)}/fail-and-refund`,
      });
      return mapAdminTaskRefundResult(response.data);
    },

    async setChannelStatus(id, status) {
      await client.request({
        body: { status },
        method: "POST",
        path: `/api/channel/${id}/status`,
      });
    },

    async testChannel(id) {
      const response = await client.requestRaw<unknown>({ path: `/api/channel/test/${id}` });
      return mapChannelTestResult(response);
    },
  };
}

export const adminRepository = createAdminRepository();

export function mapAdminSession(value: unknown): AdminSession {
  const bundle = record(value, "session");
  const user = record(bundle.user, "session.user");
  const permissions = optionalRecord(user.permissions);
  return {
    accessExpiresAt: number(bundle.access_expires_at, "session.access_expires_at"),
    accessToken: string(bundle.access_token, "session.access_token"),
    user: {
      adminPermissions: mapAdminPermissions(permissions.admin_permissions),
      displayName:
        optionalString(user.display_name) || string(user.username, "session.user.username"),
      id: number(user.id, "session.user.id"),
      role: number(user.role, "session.user.role"),
      username: string(user.username, "session.user.username"),
    },
  };
}

export function mapAdminChannelPage(
  value: unknown,
  input: Pick<ChannelListInput, "page" | "pageSize">,
): AdminChannelPage {
  const page = record(value, "channels");
  const items = array(page.items, "channels.items").map(mapAdminChannel);
  const rawTypeCounts = record(page.type_counts, "channels.type_counts");
  const typeCounts: Record<number, number> = {};
  for (const [key, value] of Object.entries(rawTypeCounts)) {
    const channelType = Number(key);
    if (Number.isSafeInteger(channelType))
      typeCounts[channelType] = number(value, `channels.type_counts.${key}`);
  }
  return {
    items,
    page: optionalNumber(page.page) ?? input.page,
    pageSize: optionalNumber(page.page_size) ?? input.pageSize,
    total: number(page.total, "channels.total"),
    typeCounts,
  };
}

function mapAdminChannel(value: unknown): AdminChannel {
  const channel = record(value, "channel");
  const rawStatus = number(channel.status, "channel.status");
  if (!channelStatuses.has(rawStatus)) throw new Error("Invalid channel.status response.");
  return {
    balanceUsd: number(channel.balance, "channel.balance"),
    baseUrl: nullableString(channel.base_url, "channel.base_url"),
    group: string(channel.group, "channel.group"),
    id: number(channel.id, "channel.id"),
    modelCount: optionalString(channel.models)
      .split(",")
      .filter((model) => model.trim()).length,
    name: string(channel.name, "channel.name"),
    priority: optionalNumber(channel.priority) ?? 0,
    responseTimeMs: number(channel.response_time, "channel.response_time"),
    status: rawStatus as ChannelStatus,
    tag: nullableString(channel.tag, "channel.tag"),
    testTime: number(channel.test_time, "channel.test_time"),
    type: number(channel.type, "channel.type"),
    weight: optionalNumber(channel.weight) ?? 0,
  };
}

function channelListQuery(input: ChannelListInput): string {
  const query = new URLSearchParams({
    p: String(input.page),
    page_size: String(input.pageSize),
    view: "summary",
  });
  if (input.keyword) query.set("keyword", input.keyword);
  if (input.status !== "all") query.set("status", input.status);
  return query.toString();
}

function mapChannelTestResult(value: unknown): ChannelTestResult {
  const result = record(value, "channel test");
  if (result.success !== true) {
    throw new Error(optionalString(result.message) || "Channel test failed.");
  }
  return { durationSeconds: number(result.time, "channel test.time") };
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field} response.`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapAdminPermissions(value: unknown): AdminPermissionMap {
  const result: AdminPermissionMap = {};
  for (const [resource, rawActions] of Object.entries(optionalRecord(value))) {
    const actions: Record<string, boolean> = {};
    for (const [action, allowed] of Object.entries(optionalRecord(rawActions))) {
      if (typeof allowed === "boolean") actions[action] = allowed;
    }
    result[resource] = actions;
  }
  return result;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field} response.`);
  return value;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field} response.`);
  }
  return value;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${field} response.`);
  return value;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(`Invalid ${field} response.`);
  return value;
}
