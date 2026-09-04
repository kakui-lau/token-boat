import type {
  AccountActivityListInput,
  AccountActivityRecord,
  AccountData,
  AccountPreferences,
  AccountSecurityResult,
  ActivityRecord,
  AlertCenterData,
  ApiKeyGroupOption,
  ApiKeyListInput,
  ApiKeyRecord,
  ApiKeyStatus,
  BillingData,
  BillingLedgerEntry,
  BillingLedgerListInput,
  BillingTransactionListInput,
  BillingTransaction,
  ChangePasswordInput,
  ConsoleRepository,
  ConsoleSession,
  ConsoleUser,
  CreateRechargeCheckoutInput,
  CreateApiKeyInput,
  CreatedApiKey,
  DateRangeValue,
  IntegrationData,
  LoginSessionRecord,
  ModelCatalogItem,
  ModelCatalogPriceSummary,
  PaymentConfirmationInput,
  PaymentConfirmationStatus,
  PaginatedResult,
  PlatformMonitor,
  PlaygroundImageGeneration,
  PlaygroundImageGenerationInput,
  PlaygroundMessageInput,
  PlaygroundReply,
  PlaygroundVideoGeneration,
  PlaygroundVideoGenerationInput,
  PlaygroundVideoStatus,
  PurchaseSubscriptionInput,
  RechargeCheckout,
  RechargeConfiguration,
  RechargeDisplayType,
  RechargePaymentMethod,
  RechargeProduct,
  RechargeQuoteInput,
  RequestLogAnalytics,
  RequestLogAnalyticsInput,
  RequestLogRecord,
  RequestLogListInput,
  SubscriptionPlan,
  SubscriptionPaymentMethod,
  TaskListInput,
  TaskRecord,
  TaskStatus,
  TaskTypeCounts,
  TaskType,
  TeamMember,
  TwoFactorBackupCodesResult,
  TwoFactorSetup,
  UpdateApiKeyInput,
  UpdateProfileInput,
  UsageData,
} from "./contracts";
import {
  asRecord,
  LiveDataContractError,
  readItems,
  readNumber,
  readOptionalBoolean,
  readOptionalItems,
  readOptionalNumber,
  readString,
  readUnixTime,
  requireBoolean,
  requireItems,
  requireNumber,
  requireString,
  requireStringField,
} from "./live-contract";
import { liveSessionRepository } from "./live-session-repository";
import {
  mapLiveEVMWalletChallenge as mapEVMWalletChallenge,
  mapLiveUser as mapUser,
} from "./live-session-mappers";
import { getLiveSession, liveApiClient as client, setLiveSession } from "./live-repository-runtime";
import { dateRangeDayCount, dateRangeToUnix, localDateToKey } from "@/lib/date-range";
import { timeZoneOffsetMinutesAt } from "@/lib/time-zone";
import {
  buildAssertionCredential,
  buildRegistrationCredential,
  prepareCredentialCreationOptions,
  prepareCredentialRequestOptions,
} from "@/lib/webauthn";

const LOG_TYPE_TOPUP = 1;
const LOG_TYPE_CONSUME = 2;
const LOG_TYPE_MANAGE = 3;
const LOG_TYPE_SYSTEM = 4;
const LOG_TYPE_ERROR = 5;
const LOG_TYPE_REFUND = 6;
const LOG_TYPE_LOGIN = 7;

function mapPaginatedResult<T>(
  value: unknown,
  input: Pick<ApiKeyListInput, "page" | "pageSize">,
  mapItem: (item: unknown) => T,
): PaginatedResult<T> {
  const page = asRecord(value);
  const items = requireItems(value, "pagination.items").map(mapItem);
  return {
    items,
    page: requireNumber(page, "page", "pagination.page"),
    pageSize: requireNumber(page, "page_size", "pagination.page_size"),
    total: requireNumber(page, "total", "pagination.total"),
  };
}

function appendPagination(
  search: URLSearchParams,
  input: Pick<ApiKeyListInput, "page" | "pageSize" | "order">,
) {
  search.set("p", String(input.page));
  search.set("page_size", String(input.pageSize));
  search.set("order", input.order);
}

function toSearchPattern(value: string): string {
  return value.length >= 2 ? `%${value}%` : value;
}

type UsageSummary = {
  costQuota: number;
  requestCount: number;
  successRate: number | null;
  totalTokens: number;
};

const playgroundVideoStatuses = new Set<PlaygroundVideoStatus>([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

function mapPlaygroundVideo(value: unknown): PlaygroundVideoGeneration {
  const video = asRecord(value);
  const status = requireString(video, "status", "playground.video.status");
  if (!playgroundVideoStatuses.has(status as PlaygroundVideoStatus)) {
    throw new LiveDataContractError("playground.video.status");
  }
  const usage = asRecord(video.usage);
  return {
    id: requireString(video, "id", "playground.video.id"),
    pollingUrl: readString(video, "polling_url"),
    status: status as PlaygroundVideoStatus,
    unsignedUrls: readOptionalItems(video.unsigned_urls, "playground.video.unsigned_urls").map(
      (url, index) => {
        if (typeof url !== "string" || !url.trim()) {
          throw new LiveDataContractError(`playground.video.unsigned_urls[${index}]`);
        }
        return requirePlaygroundMediaUrl(url, `playground.video.unsigned_urls[${index}]`);
      },
    ),
    error: readString(video, "error") || null,
    estimatedCost: readOptionalNumber(usage, "cost"),
  };
}

function requirePlaygroundMediaUrl(value: string, field: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return value;
  } catch {
    // The contract error below intentionally hides parser internals.
  }
  throw new LiveDataContractError(field);
}

function mapUsageSummary(value: unknown): UsageSummary {
  const stats = asRecord(value);
  const succeeded = requireNumber(stats, "request_count", "usage.request_count");
  const failed = requireNumber(stats, "failure_count", "usage.failure_count");
  const requestCount = succeeded + failed;
  return {
    costQuota: requireNumber(stats, "quota", "usage.quota"),
    requestCount,
    successRate: requestCount > 0 ? (succeeded / requestCount) * 100 : null,
    totalTokens: requireNumber(stats, "total_tokens", "usage.total_tokens"),
  };
}

function mapUsageAnalytics(
  value: unknown,
  range: DateRangeValue,
  quotaPerUnit: number,
  recentRequests: ActivityRecord[],
): UsageData {
  const stats = asRecord(value);
  const summary = mapUsageSummary(stats);
  const averageLatencyMs = readOptionalNumber(stats, "average_latency_ms");
  if (averageLatencyMs !== null && averageLatencyMs < 0) {
    throw new LiveDataContractError("usage.average_latency_ms");
  }
  const series = requireItems(stats.series, "usage.series").map((value, index) => {
    const point = asRecord(value);
    const dayStart = requireNumber(point, "day_start", `usage.series[${index}].day_start`);
    const succeeded = requireNumber(point, "request_count", `usage.series[${index}].request_count`);
    const failed = requireNumber(point, "failure_count", `usage.series[${index}].failure_count`);
    if (dayStart <= 0 || succeeded < 0 || failed < 0) {
      throw new LiveDataContractError(`usage.series[${index}]`);
    }
    return {
      date: localDateToKey(new Date(dayStart * 1_000)),
      requests: succeeded + failed,
      tokens: requireNumber(point, "total_tokens", `usage.series[${index}].total_tokens`),
      cost: quotaUnitsToUsd(
        requireNumber(point, "quota", `usage.series[${index}].quota`),
        quotaPerUnit,
      ),
    };
  });
  if (summary.requestCount > 0 && series.length === 0) {
    throw new LiveDataContractError("usage.series");
  }
  const models = requireItems(stats.models, "usage.models").map((value, index) => {
    const model = asRecord(value);
    const succeeded = requireNumber(model, "request_count", `usage.models[${index}].request_count`);
    const failed = requireNumber(model, "failure_count", `usage.models[${index}].failure_count`);
    if (succeeded < 0 || failed < 0) {
      throw new LiveDataContractError(`usage.models[${index}]`);
    }
    const totalRequests = succeeded + failed;
    return {
      model: requireString(model, "model_name", `usage.models[${index}].model_name`),
      requests: totalRequests,
      tokens: requireNumber(model, "total_tokens", `usage.models[${index}].total_tokens`),
      cost: quotaUnitsToUsd(
        requireNumber(model, "quota", `usage.models[${index}].quota`),
        quotaPerUnit,
      ),
      successRate: totalRequests > 0 ? (succeeded / totalRequests) * 100 : null,
    };
  });
  const apiKeys = requireItems(stats.api_keys, "usage.api_keys").map((value, index) => {
    const apiKey = asRecord(value);
    const apiKeyId = requireNumber(apiKey, "token_id", `usage.api_keys[${index}].token_id`);
    const succeeded = requireNumber(
      apiKey,
      "request_count",
      `usage.api_keys[${index}].request_count`,
    );
    const failed = requireNumber(apiKey, "failure_count", `usage.api_keys[${index}].failure_count`);
    if (!Number.isInteger(apiKeyId) || apiKeyId < 0 || succeeded < 0 || failed < 0) {
      throw new LiveDataContractError(`usage.api_keys[${index}]`);
    }
    const totalRequests = succeeded + failed;
    return {
      apiKeyId,
      apiKeyName: readString(apiKey, "token_name") || null,
      requests: totalRequests,
      tokens: requireNumber(apiKey, "total_tokens", `usage.api_keys[${index}].total_tokens`),
      cost: quotaUnitsToUsd(
        requireNumber(apiKey, "quota", `usage.api_keys[${index}].quota`),
        quotaPerUnit,
      ),
      successRate: totalRequests > 0 ? (succeeded / totalRequests) * 100 : null,
    };
  });
  return {
    range,
    totalRequests: summary.requestCount,
    totalTokens: summary.totalTokens,
    totalCost: quotaUnitsToUsd(summary.costQuota, quotaPerUnit),
    averageLatencyMs,
    successRate: summary.successRate,
    series,
    models,
    apiKeys,
    recentRequests,
  };
}

function quotaUnitsToUsd(quota: number, quotaPerUnit: number): number {
  if (!Number.isFinite(quotaPerUnit) || quotaPerUnit <= 0) {
    throw new LiveDataContractError("status.quota_per_unit");
  }
  return quota / quotaPerUnit;
}

function usdToQuotaUnits(amountUsd: number, quotaPerUnit: number, field: string): number {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) throw new LiveDataContractError(field);
  if (!Number.isFinite(quotaPerUnit) || quotaPerUnit <= 0) {
    throw new LiveDataContractError("status.quota_per_unit");
  }
  const quota = Math.round(amountUsd * quotaPerUnit);
  if (!Number.isSafeInteger(quota) || (amountUsd > 0 && quota === 0)) {
    throw new LiveDataContractError(field);
  }
  return quota;
}

function publicApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_CONSOLE_API_BASE_URL?.trim();
  return (configuredBaseUrl || window.location.origin).replace(/\/+$/, "");
}

function parseRecord(value: unknown, field?: string): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value);
  if (value === "") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (field && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
      throw new LiveDataContractError(field);
    }
    return asRecord(parsed);
  } catch {
    if (field) throw new LiveDataContractError(field);
    return {};
  }
}

function parseOptionalRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || value === undefined || value === "") return {};
  if (typeof value !== "string") {
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new LiveDataContractError(field);
    }
    return asRecord(value);
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null) return {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LiveDataContractError(field);
    }
    return asRecord(parsed);
  } catch (error) {
    if (error instanceof LiveDataContractError) throw error;
    throw new LiveDataContractError(field);
  }
}

function parseList(value: unknown, field: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  if (typeof value !== "string") throw new LiveDataContractError(field);
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new LiveDataContractError(field);
    return parsed;
  } catch {
    throw new LiveDataContractError(field);
  }
}

type LegacyPaymentResponse = {
  data?: unknown;
  message?: string;
  order_id?: string;
  success?: boolean;
  url?: string;
};

function unwrapLegacyPayment(response: LegacyPaymentResponse): unknown {
  if (response.success === true || response.message === "success") return response.data;
  const message =
    typeof response.data === "string"
      ? response.data
      : response.message || "Payment request failed";
  throw new Error(message);
}

function mapPaymentCheckout(response: LegacyPaymentResponse): RechargeCheckout {
  const data = unwrapLegacyPayment(response);
  const record = asRecord(data);
  const orderId =
    response.order_id ||
    readString(record, "order_id") ||
    readString(record, "trade_no") ||
    readString(record, "out_trade_no") ||
    undefined;
  if (response.url) {
    const fields = Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, String(value)]),
    );
    return { kind: "form", url: response.url, fields, orderId };
  }
  const url =
    readString(record, "pay_link") ||
    readString(record, "payment_url") ||
    readString(record, "checkout_url") ||
    (typeof data === "string" ? data : "");
  if (!url) throw new Error("The payment provider did not return a checkout URL");
  return { kind: "redirect", url, orderId };
}

function mapTaskStatus(value: string): TaskStatus {
  switch (value.toUpperCase()) {
    case "NOT_START":
    case "SUBMITTED":
    case "QUEUED":
      return "queued";
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETED":
      return "succeeded";
    case "FAILURE":
    case "FAILED":
      return "failed";
    case "IN_PROGRESS":
    case "PROCESSING":
      return "processing";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "unknown";
  }
}

function inferTaskType(
  platform: string | null,
  action: string | null,
  model: string | null,
): TaskType {
  const descriptor = `${platform ?? ""} ${action ?? ""} ${model ?? ""}`.toLowerCase();
  if (/(suno|audio|speech|tts|music|lyrics)/.test(descriptor)) return "audio";
  if (/(video|veo|kling|sora|runway|luma|hailuo|vidu|seedance)/.test(descriptor)) {
    return "video";
  }
  if (/(image|draw|midjourney|mj|flux|dall-e|stable.diffusion|seedream)/.test(descriptor)) {
    return "image";
  }
  return "unknown";
}

function readTaskValue(sources: Array<Record<string, unknown>>, keys: string[]): unknown {
  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
  }
  return null;
}

function readTaskString(sources: Array<Record<string, unknown>>, keys: string[]): string | null {
  const value = readTaskValue(sources, keys);
  return typeof value === "string" && value.trim() ? value : null;
}

function readTaskNumber(sources: Array<Record<string, unknown>>, keys: string[]): number | null {
  const rawValue = readTaskValue(sources, keys);
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function mapLiveTaskRecord(value: unknown, quotaPerUnit: number): TaskRecord {
  const record = asRecord(value);
  const properties = asRecord(record.properties);
  const data = parseRecord(record.data);
  const input = parseRecord(properties.input);
  const sources = [input, data, properties, record];
  const platform = readString(record, "platform") || null;
  const action = readString(record, "action") || null;
  const model = readTaskString(sources, ["origin_model_name", "model", "upstream_model_name"]);
  const status = mapTaskStatus(readString(record, "status"));
  const rawProgress = Number.parseFloat(String(record.progress ?? "").replace("%", ""));
  const progress =
    status === "succeeded"
      ? 100
      : Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(rawProgress, 100))
        : null;
  const rawInput = readString(properties, "input");
  const prompt =
    readTaskString(sources, ["prompt", "input", "text", "description"]) ??
    (rawInput && Object.keys(input).length === 0 ? rawInput : "");
  const rawFailureReason = readString(record, "fail_reason") || null;
  const failurePayload = parseRecord(rawFailureReason);
  const nestedFailure = asRecord(failurePayload.error);
  const failureReason =
    readTaskString([failurePayload, nestedFailure], ["message", "reason", "detail"]) ??
    rawFailureReason;
  const completedAt = readNumber(record, "finish_time");
  const startedAt = readNumber(record, "start_time");
  const rawId = readString(record, "task_id");
  const numericId = readOptionalNumber(record, "id");
  if (!rawId && numericId === null) throw new LiveDataContractError("task.task_id");
  const createdAt =
    readOptionalNumber(record, "submit_time") ??
    requireNumber(record, "created_at", "task.created_at");
  const updatedAt = readOptionalNumber(record, "updated_at");
  const id = rawId || String(numericId);
  const type = inferTaskType(platform, action, model);
  const upstreamResultUrl = readString(record, "result_url") || null;
  const resultUrl =
    type === "video" && status === "succeeded" && upstreamResultUrl
      ? `/v1/videos/${encodeURIComponent(id)}/content?index=0`
      : upstreamResultUrl;

  return {
    id,
    type,
    model,
    prompt,
    platform,
    action,
    status,
    progress,
    createdAt,
    startedAt: startedAt > 0 ? startedAt : null,
    updatedAt,
    completedAt: completedAt > 0 ? completedAt : null,
    failureReason,
    resultUrl,
    cost: quotaUnitsToUsd(requireNumber(record, "quota", "task.quota"), quotaPerUnit),
    costUnit: "usd",
    metadata: {
      durationSeconds: readTaskNumber(sources, ["duration_seconds", "duration", "seconds"]),
      resolution: readTaskString(sources, ["resolution", "size", "dimensions"]),
      aspectRatio: readTaskString(sources, ["aspect_ratio", "aspectRatio"]),
      outputCount: readTaskNumber(sources, ["n", "count", "number_of_outputs"]),
      quality: readTaskString(sources, ["quality"]),
      voice: readTaskString(sources, ["voice", "speaker"]),
      format: readTaskString(sources, ["format", "response_format", "output_format"]),
    },
  };
}

function mapApiKeyStatus(status: number): ApiKeyStatus {
  if (status === 1) return "active";
  if (status === 2) return "disabled";
  if (status === 3) return "expired";
  if (status === 4) return "exhausted";
  return "unknown";
}

function mapApiKey(value: unknown, quotaPerUnit: number): ApiKeyRecord {
  const record = asRecord(value);
  const key = requireString(record, "key", "api_key.key");
  const normalizedKey = key.startsWith("sk-") ? key.slice(3) : key;
  const visiblePrefix = normalizedKey.slice(0, 4).replaceAll("*", "").replaceAll("•", "");
  const suffix = normalizedKey.slice(-4);
  const maskedKey = visiblePrefix ? `sk-${visiblePrefix}••••••••${suffix}` : `sk-••••••••${suffix}`;
  const expiresAt = requireNumber(record, "expired_time", "api_key.expired_time");
  const lastUsedAt = requireNumber(record, "accessed_time", "api_key.accessed_time");
  const modelLimits = requireStringField(record, "model_limits", "api_key.model_limits");
  const allowIps =
    record.allow_ips === null ? "" : requireStringField(record, "allow_ips", "api_key.allow_ips");
  return {
    id: requireNumber(record, "id", "api_key.id"),
    name: requireString(record, "name", "api_key.name"),
    maskedKey,
    status: mapApiKeyStatus(requireNumber(record, "status", "api_key.status")),
    createdAt: requireNumber(record, "created_time", "api_key.created_time"),
    lastUsedAt: lastUsedAt > 0 ? lastUsedAt : null,
    expiresAt: expiresAt > 0 ? expiresAt : null,
    unlimitedQuota: requireBoolean(record, "unlimited_quota", "api_key.unlimited_quota"),
    remainingQuotaUsd: quotaUnitsToUsd(
      requireNumber(record, "remain_quota", "api_key.remain_quota"),
      quotaPerUnit,
    ),
    usedQuotaUsd: quotaUnitsToUsd(
      requireNumber(record, "used_quota", "api_key.used_quota"),
      quotaPerUnit,
    ),
    group: requireString(record, "group", "api_key.group"),
    environment: "unclassified",
    allowedModels: modelLimits
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    allowedIps: allowIps
      .split(/[\n,]+/)
      .map((ip) => ip.trim())
      .filter(Boolean),
  };
}

function mapActivity(value: unknown): ActivityRecord {
  const record = asRecord(value);
  const other = parseOptionalRecord(record.other, "activity.other");
  const endpoint = (
    readString(record, "request_path") || readString(other, "request_path")
  ).toLowerCase();
  const event: ActivityRecord["event"] = /^\/v1\/images(?:\/|$)/.test(endpoint)
    ? "image"
    : /^\/v1\/embeddings(?:\/|$)/.test(endpoint)
      ? "embedding"
      : /^\/v1\/(videos|tasks)(?:\/|$)/.test(endpoint)
        ? "task"
        : /^\/(?:v1|pg)\/(chat\/completions|completions|responses)(?:\/|$)/.test(endpoint)
          ? "chat"
          : "unknown";
  const logType = requireNumber(record, "type", "activity.type");
  return {
    id: requireString(record, "request_id", "activity.request_id"),
    event,
    model: readString(record, "model_name") || readString(record, "model") || null,
    createdAt: requireNumber(record, "created_at", "activity.created_at"),
    status: logType === LOG_TYPE_CONSUME ? "succeeded" : "failed",
  };
}

function mapRequestLog(value: unknown): RequestLogRecord {
  const record = asRecord(value);
  const other = parseOptionalRecord(record.other, "request_log.other");
  const logType = requireNumber(record, "type", "request_log.type");
  const statusCode =
    readOptionalNumber(record, "status_code") ?? readOptionalNumber(other, "status_code");
  const failed = (statusCode !== null && statusCode >= 400) || logType === LOG_TYPE_ERROR;
  let latencyMs: number | null = null;
  const responseTime =
    readOptionalNumber(record, "response_time") ?? readOptionalNumber(other, "response_time_ms");
  const latency = readOptionalNumber(record, "latency");
  const useTimeSeconds = readOptionalNumber(record, "use_time");
  if (responseTime !== null && responseTime >= 0) {
    latencyMs = responseTime;
  } else if (latency !== null && latency >= 0) {
    latencyMs = latency;
  } else if (useTimeSeconds !== null && useTimeSeconds >= 0) {
    latencyMs = useTimeSeconds * 1_000;
  }
  const firstTokenLatency = Number(other.frt);
  const firstTokenLatencyMs =
    Number.isFinite(firstTokenLatency) && firstTokenLatency > 0 ? firstTokenLatency : null;
  const streamStatusRecord = asRecord(other.stream_status);
  let streamStatusErrors: string[] = [];
  if (streamStatusRecord.errors !== undefined && streamStatusRecord.errors !== null) {
    if (
      !Array.isArray(streamStatusRecord.errors) ||
      !streamStatusRecord.errors.every((error): error is string => typeof error === "string")
    ) {
      throw new LiveDataContractError("request_log.other.stream_status.errors");
    }
    streamStatusErrors = streamStatusRecord.errors;
  }
  const hasStreamStatus = Object.keys(streamStatusRecord).length > 0;
  const cacheWrite5m = readOptionalNumber(other, "cache_creation_tokens_5m");
  const cacheWrite1h = readOptionalNumber(other, "cache_creation_tokens_1h");
  const cacheWriteTotal =
    readOptionalNumber(other, "cache_write_tokens") ??
    readOptionalNumber(other, "cache_creation_tokens");
  const toolSurcharges = readOptionalItems(
    other.tool_surcharges,
    "request_log.other.tool_surcharges",
  ).map((value, index) => {
    const item = asRecord(value);
    const name = requireString(item, "name", `request_log.other.tool_surcharges[${index}].name`);
    const count = requireNumber(item, "count", `request_log.other.tool_surcharges[${index}].count`);
    const unitPrice = requireNumber(
      item,
      "price",
      `request_log.other.tool_surcharges[${index}].price`,
    );
    if (!Number.isInteger(count) || count <= 0 || unitPrice < 0) {
      throw new LiveDataContractError(`request_log.other.tool_surcharges[${index}]`);
    }
    return { name, count, unitPrice, totalCost: (unitPrice * count) / 1_000 };
  });
  const taskId = readString(record, "task_id") || readString(other, "task_id");
  const taskDurationSeconds = readOptionalNumber(other, "task_duration_sec");
  const refundedQuota = readOptionalNumber(other, "refunded_quota");
  const isTask = readOptionalBoolean(other, "is_task") === true || taskId.length > 0;
  const recordedQuotaPerUnit = readOptionalNumber(other, "quota_per_unit");
  const content = readString(record, "content");
  return {
    id: requireString(record, "request_id", "request_log.request_id"),
    serviceTraceId:
      readString(record, "service_trace_id", readString(record, "upstream_request_id")) || null,
    sourceIp: readString(record, "ip") || null,
    endpoint:
      readString(record, "request_path") ||
      readString(other, "request_path") ||
      readString(record, "endpoint") ||
      null,
    model: readString(record, "model_name") || readString(record, "model") || null,
    apiKeyName: readString(record, "token_name") || readString(record, "token") || null,
    group: readString(record, "group", readString(other, "group")) || null,
    createdAt: requireNumber(record, "created_at", "request_log.created_at"),
    status: failed ? "failed" : "succeeded",
    statusCode,
    isStream: readOptionalBoolean(record, "is_stream"),
    inputTokens: requireNumber(record, "prompt_tokens", "request_log.prompt_tokens"),
    inputTokensTotal: readOptionalNumber(other, "input_tokens_total") ?? undefined,
    outputTokens: requireNumber(record, "completion_tokens", "request_log.completion_tokens"),
    cacheReadTokens: readOptionalNumber(other, "cache_tokens") ?? undefined,
    cacheWriteTokens: cacheWriteTotal ?? undefined,
    cacheWrite5mTokens: cacheWrite5m ?? undefined,
    cacheWrite1hTokens: cacheWrite1h ?? undefined,
    imageTokens: readOptionalNumber(other, "image_output") ?? undefined,
    audioInputTokens: readOptionalNumber(other, "audio_input") ?? undefined,
    audioOutputTokens: readOptionalNumber(other, "audio_output") ?? undefined,
    textInputTokens: readOptionalNumber(other, "text_input") ?? undefined,
    textOutputTokens: readOptionalNumber(other, "text_output") ?? undefined,
    toolSurcharges,
    latencyMs,
    firstTokenLatencyMs,
    cost: requireNumber(record, "quota", "request_log.quota"),
    quotaPerUnit:
      recordedQuotaPerUnit !== null && recordedQuotaPerUnit > 0 ? recordedQuotaPerUnit : undefined,
    billingMode: readString(other, "billing_mode") || null,
    billingTier: readString(other, "matched_tier") || null,
    billingSource: readString(other, "billing_source") || null,
    billingPreference: readString(other, "billing_preference") || null,
    billingStage: readString(other, "billing_stage") || null,
    estimatedCost: readOptionalNumber(other, "local_estimated_quota"),
    preConsumedCost: readOptionalNumber(other, "actual_pre_consumed_quota"),
    finalCost: readOptionalNumber(other, "customer_final_quota"),
    adjustmentCost: readOptionalNumber(other, "adjustment_quota"),
    outstandingCost: readOptionalNumber(other, "outstanding_quota"),
    subscriptionPlanTitle: readString(other, "subscription_plan_title") || null,
    subscriptionConsumedCost: readOptionalNumber(other, "subscription_consumed"),
    subscriptionRemainingCost: readOptionalNumber(other, "subscription_remain"),
    usageSemantic: readString(other, "usage_semantic") || null,
    usageCountSource: readString(other, "usage_count_source") || null,
    requestPolicyApplied: readOptionalBoolean(other, "is_system_prompt_overwritten") === true,
    task: isTask
      ? {
          id: taskId,
          platform: readString(other, "task_platform") || null,
          action: readString(other, "task_action") || null,
          status: readString(other, "task_status") || null,
          durationMs:
            taskDurationSeconds === null || taskDurationSeconds < 0
              ? null
              : taskDurationSeconds * 1_000,
          refundedCost: refundedQuota,
          failureReason:
            readString(other, "task_failure_reason") || (failed ? content : "") || null,
          refundReason: readString(other, "reason") || null,
        }
      : null,
    reasoningEffort: readString(other, "reasoning_effort") || null,
    streamStatus: hasStreamStatus
      ? {
          status: readString(streamStatusRecord, "status") || null,
          endReason: readString(streamStatusRecord, "end_reason") || null,
          errorCount: readOptionalNumber(streamStatusRecord, "error_count"),
          endError: readString(streamStatusRecord, "end_error") || null,
          errors: streamStatusErrors,
        }
      : null,
    content: content || null,
    errorCode: failed
      ? readString(record, "error_code") || readString(other, "error_code") || null
      : null,
    errorType: failed ? readString(other, "error_type") || null : null,
    errorMessage: failed ? content || readString(record, "error") || null : null,
  };
}

function mapPricedRequestLog(value: unknown, quotaPerUnit: number): RequestLogRecord {
  const record = mapRequestLog(value);
  const requestQuotaPerUnit = record.quotaPerUnit ?? quotaPerUnit;
  return {
    ...record,
    cost: quotaUnitsToUsd(record.cost, requestQuotaPerUnit),
    estimatedCost:
      record.estimatedCost == null
        ? null
        : quotaUnitsToUsd(record.estimatedCost, requestQuotaPerUnit),
    preConsumedCost:
      record.preConsumedCost == null
        ? null
        : quotaUnitsToUsd(record.preConsumedCost, requestQuotaPerUnit),
    finalCost:
      record.finalCost == null ? null : quotaUnitsToUsd(record.finalCost, requestQuotaPerUnit),
    adjustmentCost:
      record.adjustmentCost == null
        ? null
        : quotaUnitsToUsd(record.adjustmentCost, requestQuotaPerUnit),
    outstandingCost:
      record.outstandingCost == null
        ? null
        : quotaUnitsToUsd(record.outstandingCost, requestQuotaPerUnit),
    subscriptionConsumedCost:
      record.subscriptionConsumedCost == null
        ? null
        : quotaUnitsToUsd(record.subscriptionConsumedCost, requestQuotaPerUnit),
    subscriptionRemainingCost:
      record.subscriptionRemainingCost == null
        ? null
        : quotaUnitsToUsd(record.subscriptionRemainingCost, requestQuotaPerUnit),
    task:
      record.task == null
        ? null
        : {
            ...record.task,
            refundedCost:
              record.task.refundedCost == null
                ? null
                : quotaUnitsToUsd(record.task.refundedCost, requestQuotaPerUnit),
          },
  };
}

function mapAccountActivity(value: unknown): AccountActivityRecord {
  const record = asRecord(value);
  const logType = requireNumber(record, "type", "account_activity.type");
  let type: AccountActivityRecord["type"];
  if (logType === LOG_TYPE_MANAGE) type = "management";
  else if (logType === LOG_TYPE_SYSTEM) type = "system";
  else if (logType === LOG_TYPE_LOGIN) type = "login";
  else throw new LiveDataContractError("account_activity.type");

  const createdAt = requireNumber(record, "created_at", "account_activity.created_at");
  if (createdAt <= 0) throw new LiveDataContractError("account_activity.created_at");
  const eventId = readString(record, "request_id") || null;
  const rowId = readOptionalNumber(record, "id");
  if (eventId === null && rowId === null) {
    throw new LiveDataContractError("account_activity.request_id");
  }

  const other = parseOptionalRecord(record.other, "account_activity.other");
  const op = asRecord(other.op);
  let parameters: Record<string, unknown> | null = null;
  if (op.params !== null && op.params !== undefined) {
    if (typeof op.params !== "object" || Array.isArray(op.params)) {
      throw new LiveDataContractError("account_activity.other.op.params");
    }
    const parsedParameters = asRecord(op.params);
    parameters = Object.keys(parsedParameters).length > 0 ? parsedParameters : null;
  }
  const loginMethod =
    type === "login"
      ? readString(other, "login_method", readString(parameters ?? {}, "method")) || null
      : null;

  return {
    id: eventId ?? String(rowId),
    eventId,
    type,
    createdAt,
    content: readString(record, "content") || null,
    action: readString(op, "action") || null,
    parameters,
    sourceIp: readString(record, "ip") || null,
    loginMethod,
    userAgent: readString(other, "user_agent") || null,
  };
}

type RawBillingLedgerEntry = Omit<BillingLedgerEntry, "amountUsd"> & {
  amountQuota: number | null;
};

function mapBillingLedgerEntry(value: unknown): RawBillingLedgerEntry {
  const record = asRecord(value);
  const logType = requireNumber(record, "type", "billing_ledger.type");
  let type: BillingLedgerEntry["type"];
  if (logType === LOG_TYPE_TOPUP) type = "topup";
  else if (logType === LOG_TYPE_REFUND) type = "refund";
  else throw new LiveDataContractError("billing_ledger.type");

  const createdAt = requireNumber(record, "created_at", "billing_ledger.created_at");
  if (createdAt <= 0) throw new LiveDataContractError("billing_ledger.created_at");
  const eventId = readString(record, "request_id") || null;
  const taskId = readString(record, "task_id") || null;
  const rowId = readOptionalNumber(record, "id");
  if (eventId === null && taskId === null && rowId === null) {
    throw new LiveDataContractError("billing_ledger.id");
  }

  let amountQuota: number | null = null;
  if (type === "refund") {
    amountQuota = requireNumber(record, "quota", "billing_ledger.quota");
    if (amountQuota < 0) throw new LiveDataContractError("billing_ledger.quota");
  }

  return {
    id: eventId ?? taskId ?? String(rowId),
    eventId,
    type,
    createdAt,
    content: readString(record, "content") || null,
    sourceIp: readString(record, "ip") || null,
    amountQuota,
    model: readString(record, "model_name") || null,
    apiKeyName: readString(record, "token_name") || null,
    taskId,
  };
}

type CatalogPriceSelection = {
  amount: number;
  qualifier: "from" | null;
  unit: string;
};

const catalogInputPriceComponents = [
  "token_input",
  "image_token_input",
  "audio_token_input",
  "image_input",
  "audio_input",
  "video_input",
  "character_input",
] as const;

const catalogOutputPriceComponents = [
  "token_output",
  "image_token_output",
  "audio_token_output",
  "video_output",
  "request",
  "generated_item",
  "image_output",
  "audio_output",
  "character_output",
] as const;

function selectCatalogPriceSummary(
  record: Record<string, unknown>,
  group: string,
): {
  source: ModelCatalogItem["accountPriceSource"];
  summary: Record<string, unknown>;
} | null {
  const groupPrices = asRecord(record.sales_prices_by_group);
  const summary = asRecord(groupPrices[group]);
  if (Object.keys(summary).length === 0) return null;
  const items = requireItems(summary.items, "pricing.group.items");
  return items.length > 0 ? { source: "group", summary } : null;
}

function mapCatalogPriceSummary(value: unknown, field: string): ModelCatalogPriceSummary | null {
  const summary = asRecord(value);
  if (Object.keys(summary).length === 0) return null;
  const rawItems = requireItems(summary.items, `${field}.items`);
  if (rawItems.length === 0) return null;
  const currency = requireString(summary, "currency", `${field}.currency`);
  const items: ModelCatalogPriceSummary["items"] = [];
  for (const [index, value] of rawItems.entries()) {
    const item = asRecord(value);
    const component = requireString(item, "component", `${field}.items[${index}].component`);
    const unit = requireString(item, "unit", `${field}.items[${index}].unit`);
    const amount = requireNumber(item, "amount", `${field}.items[${index}].amount`);
    const baseAmount = readOptionalNumber(item, "base_amount");
    const unitSize = requireNumber(item, "unit_size", `${field}.items[${index}].unit_size`);
    if (amount < 0) throw new LiveDataContractError(`${field}.items[${index}].amount`);
    if (baseAmount !== null && baseAmount < 0) {
      throw new LiveDataContractError(`${field}.items[${index}].base_amount`);
    }
    if (unitSize <= 0) throw new LiveDataContractError(`${field}.items[${index}].unit_size`);
    items.push({
      key: readString(item, "key", `${component}-${index}`),
      component,
      amount,
      baseAmount: baseAmount !== null && baseAmount >= 0 ? baseAmount : null,
      unit,
      unitSize,
      tier: readString(item, "tier") || null,
      upperBound: readString(item, "upper_bound") || null,
      operation: readString(item, "operation") || null,
      quality: readString(item, "quality") || null,
      resolution: readString(item, "resolution") || null,
      withAudio: readString(item, "with_audio") || null,
      appliedGroup: readString(item, "applied_group") || null,
      appliedGroupLabel: readString(item, "applied_group_label") || null,
    });
  }
  const candidateCount = readNumber(summary, "candidate_count", Number.NaN);
  return {
    currency,
    billingMode: requireString(summary, "billing_mode", `${field}.billing_mode`),
    priceStructure: requireString(summary, "price_structure", `${field}.price_structure`),
    comparisonScope: readString(summary, "comparison_scope") || null,
    candidateCount: Number.isFinite(candidateCount) ? candidateCount : null,
    items,
  };
}

function selectCatalogPrice(
  summary: Record<string, unknown>,
  components: readonly string[],
): CatalogPriceSelection | null {
  const items = readItems(summary.items).map(asRecord);
  for (const component of components) {
    const candidates = items
      .filter((item) => readString(item, "component") === component)
      .map((item) => ({ item, amount: readNumber(item, "amount", Number.NaN) }))
      .filter(({ amount }) => Number.isFinite(amount) && amount >= 0);
    if (candidates.length === 0) continue;
    const selected = candidates.reduce((lowest, candidate) =>
      candidate.amount < lowest.amount ? candidate : lowest,
    );
    return {
      amount: selected.amount,
      qualifier: candidates.length > 1 ? "from" : null,
      unit: requireString(selected.item, "unit", "pricing.items[].unit"),
    };
  }
  return null;
}

function catalogPriceUnit(unit: string): ModelCatalogItem["inputPriceUnit"] {
  if (unit === "second") return "second";
  if (unit === "request" || unit === "item") return "request";
  if (unit === "token") return "million_tokens";
  return null;
}

function mapCatalogModel(
  value: unknown,
  group: string,
  vendorNamesById: ReadonlyMap<number, string>,
): ModelCatalogItem {
  const record = asRecord(value);
  const id = requireString(record, "model_name", "pricing.model_name");
  const vendorId = readNumber(record, "vendor_id", Number.NaN);
  const provider =
    (Number.isInteger(vendorId) ? vendorNamesById.get(vendorId) : undefined) ||
    readString(record, "provider", readString(record, "owner_by")) ||
    null;
  const priceSelection = selectCatalogPriceSummary(record, group);
  const selectedPriceSummary = priceSelection?.summary ?? null;
  const accountPrice = mapCatalogPriceSummary(selectedPriceSummary, `pricing.${id}.account_price`);
  const priceSummary = accountPrice ? selectedPriceSummary : null;
  const officialPrice = mapCatalogPriceSummary(
    record.official_price,
    `pricing.${id}.official_price`,
  );
  const structuredInput = priceSummary
    ? selectCatalogPrice(priceSummary, catalogInputPriceComponents)
    : null;
  const structuredOutput = priceSummary
    ? selectCatalogPrice(priceSummary, catalogOutputPriceComponents)
    : null;
  const legacyCurrency = readString(record, "currency");
  const legacyUnit = readString(record, "price_unit");
  const legacyPriceContractValid =
    Boolean(legacyCurrency) && ["token", "request", "second"].includes(legacyUnit);
  const legacyInput = legacyPriceContractValid
    ? readNumber(record, "input_price", Number.NaN)
    : Number.NaN;
  const legacyOutput = legacyPriceContractValid
    ? readNumber(record, "output_price", Number.NaN)
    : Number.NaN;
  const inputPrice = structuredInput?.amount ?? legacyInput;
  const outputPrice = structuredOutput?.amount ?? legacyOutput;
  const contextWindow = readNumber(
    record,
    "context_window",
    readNumber(record, "context_length", Number.NaN),
  );
  const maxOutputTokens = readNumber(record, "max_output_tokens", Number.NaN);
  const limitsVerifiedAt = readNumber(record, "limits_verified_at", Number.NaN);
  const tags = readString(record, "tags");
  const features = tags
    .split(/[,，]/)
    .map((feature) => feature.trim())
    .filter(Boolean);
  const billingMode = priceSummary ? readString(priceSummary, "billing_mode") : "";
  return {
    id,
    provider,
    description: readString(record, "description") || null,
    family: catalogModelFamily(billingMode, tags),
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : null,
    maxOutputTokens:
      Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : null,
    limitsSourceUrl: readString(record, "limits_source_url").trim() || null,
    limitsVerifiedAt:
      Number.isFinite(limitsVerifiedAt) && limitsVerifiedAt > 0 ? limitsVerifiedAt : null,
    inputPrice: Number.isFinite(inputPrice) ? inputPrice : null,
    inputPriceQualifier: structuredInput?.qualifier ?? null,
    inputPriceUnit: catalogPriceUnit(structuredInput?.unit ?? legacyUnit),
    outputPrice: Number.isFinite(outputPrice) ? outputPrice : null,
    outputPriceQualifier: structuredOutput?.qualifier ?? null,
    outputPriceUnit: catalogPriceUnit(structuredOutput?.unit ?? legacyUnit),
    currency: accountPrice?.currency ?? (legacyPriceContractValid ? legacyCurrency : null),
    pricingAvailable:
      Boolean(accountPrice || structuredInput || structuredOutput) ||
      Number.isFinite(legacyInput) ||
      Number.isFinite(legacyOutput),
    pricingSource: readString(record, "pricing_source") || null,
    accountPriceSource: accountPrice ? (priceSelection?.source ?? null) : null,
    accountPrice,
    officialPrice,
    available: requireBoolean(record, "available", `pricing.${id}.available`),
    availabilityStatus: readString(record, "availability_status") || null,
    features,
    supportedEndpointTypes: readOptionalItems(
      record.supported_endpoint_types,
      `pricing.${id}.supported_endpoint_types`,
    )
      .map(String)
      .filter(Boolean),
  };
}

function catalogModelFamily(billingMode = "", tags = ""): ModelCatalogItem["family"] {
  const declaredMetadata = `${billingMode} ${tags}`;
  if (/video|视频/i.test(declaredMetadata)) return "video";
  if (/audio|speech|tts|音频|语音/i.test(declaredMetadata)) return "audio";
  if (/image|图像/i.test(declaredMetadata)) return "image";
  if (/embedding|嵌入/i.test(declaredMetadata)) return "embedding";
  if (/reason|推理/i.test(declaredMetadata)) return "reasoning";
  if (/chat|对话/i.test(declaredMetadata)) return "chat";
  return "unknown";
}

function mapLoginSession(value: unknown): LoginSessionRecord {
  const record = asRecord(value);
  return {
    id: requireString(record, "sid", "login_session.sid"),
    current: requireBoolean(record, "current", "login_session.current"),
    method: requireString(record, "login_method", "login_session.login_method"),
    ip: readString(record, "ip"),
    userAgent: readString(record, "user_agent"),
    createdAt: requireNumber(record, "created_at", "login_session.created_at"),
    lastActiveAt: requireNumber(record, "last_active_at", "login_session.last_active_at"),
    expiresAt: requireNumber(record, "expires_at", "login_session.expires_at"),
  };
}

function mapNotificationType(value: string): AccountPreferences["notifyType"] {
  if (value === "") return null;
  if (value === "email") return value;
  if (value === "webhook" || value === "bark" || value === "gotify") return value;
  throw new LiveDataContractError("user_setting.notify_type");
}

function mapPlatformStatus(value: unknown): AlertCenterData["platform"] {
  const groups = requireItems(value, "uptime.groups");
  const monitors: PlatformMonitor[] = [];

  groups.forEach((groupValue, groupIndex) => {
    const group = asRecord(groupValue);
    const categoryName = readString(group, "categoryName");
    requireItems(group.monitors, `uptime.groups[${groupIndex}].monitors`).forEach(
      (monitorValue, monitorIndex) => {
        const monitor = asRecord(monitorValue);
        const name = requireString(
          monitor,
          "name",
          `uptime.groups[${groupIndex}].monitors[${monitorIndex}].name`,
        );
        const rawStatus = readNumber(monitor, "status", -1);
        let status: PlatformMonitor["status"] = "unknown";
        if (rawStatus === 1) status = "operational";
        else if (rawStatus === 0) status = "outage";
        else if (rawStatus === 2) status = "degraded";
        const rawUptime = readNumber(monitor, "uptime", Number.NaN);
        const uptimePercent = Number.isFinite(rawUptime)
          ? Math.min(100, Math.max(0, rawUptime <= 1 ? rawUptime * 100 : rawUptime))
          : null;
        monitors.push({
          id: `${groupIndex}-${monitorIndex}`,
          group: readString(monitor, "group") || categoryName,
          name,
          status,
          uptimePercent,
        });
      },
    );
  });

  let status: AlertCenterData["platform"]["status"] = "unknown";
  if (monitors.some((monitor) => monitor.status === "outage")) status = "outage";
  else if (monitors.some((monitor) => monitor.status === "degraded")) status = "degraded";
  else if (monitors.length > 0 && monitors.every((monitor) => monitor.status === "operational")) {
    status = "operational";
  }

  const uptimeValues = monitors.flatMap((monitor) =>
    monitor.uptimePercent === null ? [] : [monitor.uptimePercent],
  );
  return {
    configured: groups.length > 0 ? true : null,
    monitors,
    status,
    uptimePercent: uptimeValues.length > 0 ? Math.min(...uptimeValues) : null,
  };
}

function mapAccountPreferences(value: unknown, quotaPerUnit: number): AccountPreferences {
  const settings = parseRecord(value, "user_setting");
  const configuredThreshold = requireNumber(
    settings,
    "quota_warning_threshold",
    "user_setting.quota_warning_threshold",
  );
  const recordIpForced = requireBoolean(
    settings,
    "record_ip_forced",
    "user_setting.record_ip_forced",
  );
  return {
    balanceWarningThresholdUsd:
      configuredThreshold > 0 ? quotaUnitsToUsd(configuredThreshold, quotaPerUnit) : null,
    barkUrl: readString(settings, "bark_url"),
    gotifyPriority: requireNumber(settings, "gotify_priority", "user_setting.gotify_priority"),
    gotifyToken: "",
    gotifyTokenConfigured: requireBoolean(
      settings,
      "gotify_token_configured",
      "user_setting.gotify_token_configured",
    ),
    gotifyUrl: readString(settings, "gotify_url"),
    notificationEmail: readString(settings, "notification_email"),
    notifyType: mapNotificationType(readString(settings, "notify_type")),
    recordIpForced,
    recordIpLog:
      recordIpForced || requireBoolean(settings, "record_ip_log", "user_setting.record_ip_log"),
    webhookSecret: "",
    webhookSecretConfigured: requireBoolean(
      settings,
      "webhook_secret_configured",
      "user_setting.webhook_secret_configured",
    ),
    webhookUrl: readString(settings, "webhook_url"),
  };
}

async function getUserRecord(): Promise<Record<string, unknown>> {
  const response = await client.request<unknown>({ path: "/api/user/self" });
  return asRecord(response.data);
}

async function getUser(): Promise<ConsoleUser> {
  return mapUser(await getUserRecord());
}

async function getQuotaPerUnit(): Promise<number> {
  const response = await client.request<unknown>({
    path: "/api/status",
    authenticated: false,
  });
  const quotaPerUnit = requireNumber(
    asRecord(response.data),
    "quota_per_unit",
    "status.quota_per_unit",
  );
  if (quotaPerUnit <= 0) throw new LiveDataContractError("status.quota_per_unit");
  return quotaPerUnit;
}

async function getApiKeysPage(input: ApiKeyListInput): Promise<PaginatedResult<ApiKeyRecord>> {
  const search = new URLSearchParams();
  appendPagination(search, input);
  const keyword = input.keyword.trim();
  if (keyword) search.set("keyword", toSearchPattern(keyword));
  if (input.status !== "all") {
    search.set(
      "status",
      String({ active: 1, disabled: 2, expired: 3, exhausted: 4 }[input.status]),
    );
  }
  const path = keyword ? "/api/token/search" : "/api/token/";
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({ path: `${path}?${search.toString()}` }),
    getQuotaPerUnit(),
  ]);
  return mapPaginatedResult(response.data, input, (value) => mapApiKey(value, quotaPerUnit));
}

async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const result = await getApiKeysPage({
    keyword: "",
    order: "desc",
    page: 1,
    pageSize: 100,
    status: "all",
  });
  return result.items;
}

async function getRecentActivity(range: DateRangeValue): Promise<ActivityRecord[]> {
  const unixRange = dateRangeToUnix(range);
  const response = await client.request<unknown>({
    path: `/api/log/self?scope=request&p=1&page_size=20&start_timestamp=${unixRange.start}&end_timestamp=${unixRange.end}`,
  });
  const activity: ActivityRecord[] = [];
  for (const value of requireItems(response.data, "activity.items")) {
    const logType = readOptionalNumber(asRecord(value), "type");
    if (logType !== LOG_TYPE_CONSUME && logType !== LOG_TYPE_ERROR) continue;
    activity.push(mapActivity(value));
  }
  return activity;
}

async function getBillingData(): Promise<BillingData> {
  const [user, historyResponse, plansResponse, subscriptionResponse, topupResponse, quotaPerUnit] =
    await Promise.all([
      getUser(),
      client.request<unknown>({ path: "/api/user/topup/self?p=1&page_size=50" }),
      client.request<unknown>({ path: "/api/subscription/plans" }),
      client.request<unknown>({ path: "/api/subscription/self" }),
      client.request<unknown>({ path: "/api/user/topup/info" }),
      getQuotaPerUnit(),
    ]);
  const subscription = asRecord(subscriptionResponse.data);
  const activePlanIds = new Set(
    requireItems(subscription.subscriptions, "subscription.subscriptions")
      .map((value) =>
        requireNumber(
          asRecord(asRecord(value).subscription ?? value),
          "plan_id",
          "subscription.plan_id",
        ),
      )
      .filter((id) => id > 0),
  );
  const purchaseCounts = new Map<number, number>();
  for (const value of requireItems(
    subscription.all_subscriptions,
    "subscription.all_subscriptions",
  )) {
    const planId = requireNumber(
      asRecord(asRecord(value).subscription ?? value),
      "plan_id",
      "subscription.plan_id",
    );
    if (planId > 0) purchaseCounts.set(planId, (purchaseCounts.get(planId) ?? 0) + 1);
  }
  const topup = asRecord(topupResponse.data);
  return {
    balance: quotaUnitsToUsd(user.quotaUnits, quotaPerUnit),
    totalUsage: quotaUnitsToUsd(user.usedQuotaUnits, quotaPerUnit),
    monthSpend: null,
    pendingAmount: null,
    currency: "USD",
    transactions: requireItems(historyResponse.data, "billing.transactions").map(
      mapBillingTransaction,
    ),
    plans: requireItems(plansResponse.data, "subscription.plans").map((value) =>
      mapSubscriptionPlan(value, topup, activePlanIds, purchaseCounts, quotaPerUnit),
    ),
  };
}

async function getRechargeConfiguration(): Promise<RechargeConfiguration> {
  const [topupResponse, statusResponse] = await Promise.all([
    client.request<unknown>({ path: "/api/user/topup/info" }),
    client.request<unknown>({ path: "/api/status", authenticated: false }),
  ]);
  const topup = asRecord(topupResponse.data);
  const status = asRecord(statusResponse.data);
  const quotaPerUnit = requireNumber(status, "quota_per_unit", "status.quota_per_unit");
  if (quotaPerUnit <= 0) throw new LiveDataContractError("status.quota_per_unit");
  const globalMinAmount = requireNumber(topup, "min_topup", "topup.min_topup");
  const stripeMinAmount = requireNumber(topup, "stripe_min_topup", "topup.stripe_min_topup");
  const waffoMinAmount = requireNumber(topup, "waffo_min_topup", "topup.waffo_min_topup");
  const pancakeMinAmount = requireNumber(
    topup,
    "waffo_pancake_min_topup",
    "topup.waffo_pancake_min_topup",
  );
  if (
    globalMinAmount <= 0 ||
    stripeMinAmount <= 0 ||
    waffoMinAmount <= 0 ||
    pancakeMinAmount <= 0
  ) {
    throw new LiveDataContractError("topup.minimum_amounts");
  }
  const epayEnabled = requireBoolean(topup, "enable_online_topup", "topup.enable_online_topup");
  const stripeEnabled = requireBoolean(topup, "enable_stripe_topup", "topup.enable_stripe_topup");
  const waffoEnabled = requireBoolean(topup, "enable_waffo_topup", "topup.enable_waffo_topup");
  const pancakeEnabled = requireBoolean(
    topup,
    "enable_waffo_pancake_topup",
    "topup.enable_waffo_pancake_topup",
  );

  const standardMethods = parseList(topup.pay_methods, "topup.pay_methods")
    .map((value, index): RechargePaymentMethod | null => {
      const method = asRecord(value);
      const type = requireString(method, "type", `topup.pay_methods[${index}].type`);
      const name = requireString(method, "name", `topup.pay_methods[${index}].name`);
      if (type === "waffo") return null;
      if (type === "stripe" && !stripeEnabled) return null;
      if (type === "waffo_pancake" && !pancakeEnabled) return null;
      if (type !== "stripe" && type !== "waffo_pancake" && !epayEnabled) return null;
      const fallbackMinAmount =
        type === "stripe"
          ? stripeMinAmount
          : type === "waffo_pancake"
            ? pancakeMinAmount
            : globalMinAmount;
      const configuredMinAmount = readOptionalNumber(method, "min_topup");
      if (configuredMinAmount !== null && configuredMinAmount <= 0) {
        throw new LiveDataContractError(`topup.pay_methods[${index}].min_topup`);
      }
      return {
        id: `${type}-${index}`,
        name,
        type,
        minAmount: configuredMinAmount ?? fallbackMinAmount,
        icon: readString(method, "icon") || undefined,
      };
    })
    .filter((method): method is RechargePaymentMethod => method !== null);
  const waffoMethods = (
    waffoEnabled ? parseList(topup.waffo_pay_methods, "topup.waffo_pay_methods") : []
  )
    .map((value, index): RechargePaymentMethod | null => {
      const method = asRecord(value);
      const name = requireString(method, "name", `topup.waffo_pay_methods[${index}].name`);
      return {
        id: `waffo-${index}`,
        name,
        type: "waffo",
        minAmount: waffoMinAmount,
        icon: readString(method, "icon") || undefined,
        paymentMethodIndex: index,
      };
    })
    .filter((method): method is RechargePaymentMethod => method !== null);
  const products = (
    requireBoolean(topup, "enable_creem_topup", "topup.enable_creem_topup")
      ? parseList(topup.creem_products, "topup.creem_products")
      : []
  ).map((value, index) => {
    const product = asRecord(value);
    const id = requireString(product, "productId", `topup.creem_products[${index}].productId`);
    const name = requireString(product, "name", `topup.creem_products[${index}].name`);
    const currency = readString(product, "currency");
    if (currency !== "USD" && currency !== "EUR") {
      throw new LiveDataContractError(`recharge_product.${id}.currency`);
    }
    const price = requireNumber(product, "price", `recharge_product.${id}.price`);
    const quotaUnits = requireNumber(product, "quota", `recharge_product.${id}.quota`);
    if (price <= 0) throw new LiveDataContractError(`recharge_product.${id}.price`);
    if (quotaUnits <= 0) throw new LiveDataContractError(`recharge_product.${id}.quota`);
    return {
      id,
      name,
      price,
      creditUsd: quotaUnitsToUsd(quotaUnits, quotaPerUnit),
      currency: currency as RechargeProduct["currency"],
    };
  });
  const discounts: Record<string, number> = {};
  for (const [amount, rawMultiplier] of Object.entries(
    parseRecord(topup.discount, "topup.discount"),
  )) {
    const multiplier = Number(rawMultiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      throw new LiveDataContractError(`topup.discount.${amount}`);
    }
    discounts[amount] = multiplier;
  }
  const configuredAmounts = parseList(topup.amount_options, "topup.amount_options").map(
    (rawAmount, index) => {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new LiveDataContractError(`topup.amount_options[${index}]`);
      }
      return amount;
    },
  );
  const methodMinimums = [...standardMethods, ...waffoMethods]
    .map((method) => method.minAmount)
    .filter((amount) => amount > 0);
  const minimum = methodMinimums.length > 0 ? Math.min(...methodMinimums) : globalMinAmount;
  const amountOptions =
    configuredAmounts.length > 0
      ? configuredAmounts
      : [1, 5, 10, 30, 50, 100].map((multiplier) => minimum * multiplier);
  const rawDisplayType = requireString(
    status,
    "quota_display_type",
    "status.quota_display_type",
  ).toUpperCase();
  if (!["USD", "CNY", "TOKENS"].includes(rawDisplayType)) {
    throw new LiveDataContractError("status.quota_display_type");
  }
  const displayType = rawDisplayType as RechargeDisplayType;
  const usdExchangeRate = requireNumber(status, "usd_exchange_rate", "status.usd_exchange_rate");
  if (usdExchangeRate <= 0) throw new LiveDataContractError("status.usd_exchange_rate");
  const customCurrencySymbol = readString(status, "custom_currency_symbol");

  return {
    amountOptions: [...new Set(amountOptions)].sort((left, right) => left - right).slice(0, 8),
    complianceConfirmed: requireBoolean(
      topup,
      "payment_compliance_confirmed",
      "topup.payment_compliance_confirmed",
    ),
    customCurrencySymbol,
    discounts,
    displayType,
    externalTopupUrl: readString(topup, "topup_link") || null,
    onlineEnabled: standardMethods.length + waffoMethods.length + products.length > 0,
    paymentCurrency: displayType === "CNY" ? "CNY" : "USD",
    paymentMethods: [...standardMethods, ...waffoMethods],
    products,
    quotaPerUnit,
    redemptionEnabled: requireBoolean(topup, "enable_redemption", "topup.enable_redemption"),
    usdExchangeRate,
  };
}

async function getRechargeQuote(input: RechargeQuoteInput) {
  const path =
    input.paymentMethod.type === "stripe"
      ? "/api/user/stripe/amount"
      : input.paymentMethod.type === "waffo"
        ? "/api/user/waffo/amount"
        : input.paymentMethod.type === "waffo_pancake"
          ? "/api/user/waffo-pancake/amount"
          : "/api/user/amount";
  const response = await client.requestRaw<LegacyPaymentResponse>({
    path,
    method: "POST",
    body: { amount: Math.floor(input.amount) },
  });
  const amount = Number(unwrapLegacyPayment(response));
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Unable to calculate payment amount");
  return { amount, currency: input.currency };
}

async function createRechargeCheckout(
  input: CreateRechargeCheckoutInput,
): Promise<RechargeCheckout> {
  let path: string;
  let body: Record<string, unknown>;
  if (input.product) {
    path = "/api/user/creem/pay";
    body = { payment_method: "creem", product_id: input.product.id };
  } else if (input.paymentMethod?.type === "stripe") {
    path = "/api/user/stripe/pay";
    body = {
      amount: Math.floor(input.amount),
      payment_method: "stripe",
      success_url: `${window.location.origin}/console/recharge?payment=success`,
      cancel_url: `${window.location.origin}/console/recharge?payment=cancelled`,
    };
  } else if (input.paymentMethod?.type === "waffo") {
    path = "/api/user/waffo/pay";
    body = {
      amount: Math.floor(input.amount),
      pay_method_index: input.paymentMethod.paymentMethodIndex,
      return_url: `${window.location.origin}/console/recharge?payment=pending`,
    };
  } else if (input.paymentMethod?.type === "waffo_pancake") {
    path = "/api/user/waffo-pancake/pay";
    body = { amount: Math.floor(input.amount) };
  } else if (input.paymentMethod) {
    path = "/api/user/pay";
    body = {
      amount: Math.floor(input.amount),
      payment_method: input.paymentMethod.type,
      return_url: `${window.location.origin}/console/recharge?payment=pending`,
    };
  } else {
    throw new Error("Select a payment method");
  }

  const response = await client.requestRaw<LegacyPaymentResponse>({
    path,
    method: "POST",
    body,
  });
  return mapPaymentCheckout(response);
}

async function purchaseSubscription(input: PurchaseSubscriptionInput) {
  if (input.method.type === "balance") {
    await client.request({
      path: "/api/subscription/balance/pay",
      method: "POST",
      body: { plan_id: input.planId },
    });
    return { kind: "completed" as const };
  }
  const path =
    input.method.type === "stripe"
      ? "/api/subscription/stripe/pay"
      : input.method.type === "creem"
        ? "/api/subscription/creem/pay"
        : input.method.type === "waffo_pancake"
          ? "/api/subscription/waffo-pancake/pay"
          : "/api/subscription/epay/pay";
  const body: Record<string, unknown> = { plan_id: input.planId };
  if (input.method.type === "stripe") {
    body.success_url = `${window.location.origin}/console/recharge?payment=pending`;
    body.cancel_url = `${window.location.origin}/console/recharge?payment=cancelled`;
  }
  if (input.method.type === "epay") {
    body.payment_method = input.method.paymentMethod;
    body.return_url = `${window.location.origin}/console/recharge?payment=pending`;
  }
  const response = await client.requestRaw<LegacyPaymentResponse>({
    path,
    method: "POST",
    body,
  });
  return mapPaymentCheckout(response);
}

async function getPaymentConfirmation(
  input: PaymentConfirmationInput,
  signal?: AbortSignal,
): Promise<PaymentConfirmationStatus> {
  if (input.kind === "subscription") {
    if (!input.planId) return "pending";
    const response = await client.request<unknown>({
      path: "/api/subscription/self",
      signal,
    });
    const subscription = asRecord(response.data);
    const isActive = requireItems(subscription.subscriptions, "subscription.subscriptions").some(
      (value) => {
        const record = asRecord(asRecord(value).subscription ?? value);
        return (
          readNumber(record, "plan_id") === input.planId &&
          readString(record, "status") === "active"
        );
      },
    );
    return isActive ? "completed" : "pending";
  }
  if (!input.orderId) return "pending";
  const response = await client.request<unknown>({
    path: `/api/user/topup/self?p=1&page_size=10&keyword=${encodeURIComponent(input.orderId)}`,
    signal,
  });
  const order = requireItems(response.data, "billing.transactions")
    .map(asRecord)
    .find((record) => readString(record, "trade_no") === input.orderId);
  if (!order) return "pending";
  const status = readString(order, "status");
  if (status === "success") return "completed";
  if (status === "pending") return "pending";
  if (status === "failed") return "failed";
  throw new LiveDataContractError("billing_transaction.status");
}

function applyAuthRotation(value: unknown): ConsoleSession {
  const currentSession = getLiveSession();
  if (!currentSession) throw new Error("The current session is unavailable.");
  const rotation = asRecord(value);
  const session = asRecord(rotation.session);
  const accessToken = readString(rotation, "access_token");
  if (!accessToken) throw new Error("The server did not return a rotated access token.");
  const updated: ConsoleSession = {
    ...currentSession,
    accessToken,
    accessExpiresAt: requireNumber(rotation, "access_expires_at", "session.access_expires_at"),
    sessionId: readString(session, "sid", currentSession.sessionId),
  };
  return setLiveSession(updated);
}

async function securityResult(value: unknown): Promise<AccountSecurityResult> {
  const session = applyAuthRotation(value);
  return { account: await getAccountData(), session };
}

async function createTwoFactorProof(scope: string, code: string): Promise<string> {
  const response = await client.request<unknown>({
    path: "/api/verify",
    method: "POST",
    body: { method: "2fa", scope, code: code.trim() },
  });
  const proof = readString(asRecord(response.data), "proof_token");
  if (!proof) throw new Error("The server did not return a security proof.");
  return proof;
}

function securityProofHeaders(proof?: string): Record<string, string> | undefined {
  return proof ? { "X-Security-Proof": proof } : undefined;
}

function requireCredentialsContainer(): CredentialsContainer {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new Error("Passkey is not supported in this browser.");
  }
  return navigator.credentials;
}

async function createPasskeyProof(scope: string): Promise<string> {
  const credentials = requireCredentialsContainer();
  const begin = await client.request<unknown>({
    path: "/api/user/passkey/verify/begin",
    method: "POST",
    body: { scope },
  });
  const payload = asRecord(begin.data);
  const flowToken = readString(payload, "flow_token");
  if (!flowToken) throw new Error("The Passkey verification flow expired.");
  const credential = (await credentials.get({
    publicKey: prepareCredentialRequestOptions(payload.options),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey verification was cancelled.");
  const finish = await client.request<unknown>({
    path: "/api/user/passkey/verify/finish",
    method: "POST",
    body: {
      flow_token: flowToken,
      credential: buildAssertionCredential(credential),
    },
  });
  const proof = readString(asRecord(finish.data), "proof_token");
  if (!proof) throw new Error("The server did not return a security proof.");
  return proof;
}

async function registerPasskey(proof?: string): Promise<AccountSecurityResult> {
  const credentials = requireCredentialsContainer();
  const headers = securityProofHeaders(proof);
  const begin = await client.request<unknown>({
    path: "/api/user/passkey/register/begin",
    method: "POST",
    headers,
  });
  const payload = asRecord(begin.data);
  const flowToken = readString(payload, "flow_token");
  if (!flowToken) throw new Error("The Passkey registration flow expired.");
  const credential = (await credentials.create({
    publicKey: prepareCredentialCreationOptions(payload.options),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled.");
  const finish = await client.request<unknown>({
    path: "/api/user/passkey/register/finish",
    method: "POST",
    headers,
    body: {
      flow_token: flowToken,
      credential: buildRegistrationCredential(credential),
    },
  });
  return securityResult(finish.data);
}

async function getAccountPreferences(): Promise<AccountPreferences> {
  const [settingsResponse, quotaPerUnit] = await Promise.all([
    client.request<unknown>({ path: "/api/user/setting" }),
    getQuotaPerUnit(),
  ]);
  return mapAccountPreferences(settingsResponse.data, quotaPerUnit);
}

async function getAccountData(): Promise<AccountData> {
  const [
    userRecord,
    preferences,
    sessionsResponse,
    passkeyResponse,
    twoFactorResponse,
    evmWalletResponse,
  ] = await Promise.all([
    getUserRecord(),
    getAccountPreferences(),
    client.request<unknown>({ path: "/api/user/sessions" }),
    client.request<unknown>({ path: "/api/user/passkey" }),
    client.request<unknown>({ path: "/api/user/2fa/status" }),
    client.request<unknown>({ path: "/api/user/evm-wallet" }),
  ]);
  const user = mapUser(userRecord);
  const passkey = asRecord(passkeyResponse.data);
  const twoFactor = asRecord(twoFactorResponse.data);
  const evmWallet = asRecord(evmWalletResponse.data);
  const walletVerificationMethod = readString(evmWallet, "verification_method") as
    | "2fa"
    | "passkey"
    | "password"
    | "";
  if (
    walletVerificationMethod &&
    walletVerificationMethod !== "2fa" &&
    walletVerificationMethod !== "passkey" &&
    walletVerificationMethod !== "password"
  ) {
    throw new LiveDataContractError("evm_wallet.verification_method");
  }
  return {
    user,
    preferences,
    security: {
      backupCodesRemaining:
        readNumber(twoFactor, "backup_codes_remaining", -1) >= 0
          ? readNumber(twoFactor, "backup_codes_remaining")
          : null,
      passkeyEnabled: requireBoolean(passkey, "enabled", "passkey.enabled"),
      passkeyLastUsedAt: readUnixTime(passkey, "last_used_at"),
      twoFactorEnabled: requireBoolean(twoFactor, "enabled", "two_factor.enabled"),
      twoFactorLocked: requireBoolean(twoFactor, "locked", "two_factor.locked"),
      emailBound: Boolean(user.email),
      evmWalletAddress: readString(evmWallet, "address") || null,
      evmWalletEnabled: requireBoolean(evmWallet, "enabled", "evm_wallet.enabled"),
      evmWalletLastUsedAt: readUnixTime(evmWallet, "last_used_at"),
      evmWalletRemovable: readOptionalBoolean(evmWallet, "removable") === true,
      evmWalletVerificationMethod: walletVerificationMethod || null,
    },
    sessions: requireItems(sessionsResponse.data, "login_sessions").map(mapLoginSession),
  };
}

function mapBillingTransaction(value: unknown): BillingTransaction {
  const record = asRecord(value);
  const statusValue = requireString(record, "status", "billing_transaction.status");
  let status: BillingTransaction["status"];
  if (statusValue === "success") status = "completed";
  else if (statusValue === "pending") status = "pending";
  else if (statusValue === "failed") status = "failed";
  else throw new LiveDataContractError("billing_transaction.status");
  const orderType = requireString(record, "order_type", "billing_transaction.order_type");
  if (orderType !== "wallet" && orderType !== "subscription") {
    throw new LiveDataContractError("billing_transaction.order_type");
  }
  const rawAmount =
    readOptionalNumber(record, "money") ??
    requireNumber(record, "amount", "billing_transaction.amount");
  return {
    id: requireString(record, "trade_no", "billing_transaction.trade_no"),
    type: orderType === "subscription" ? "subscription" : "topup",
    amount: orderType === "subscription" ? -Math.abs(rawAmount) : rawAmount,
    status,
    createdAt: requireNumber(record, "create_time", "billing_transaction.create_time"),
    description: readString(record, "payment_method") || null,
  };
}

function mapSubscriptionPlan(
  value: unknown,
  topup: Record<string, unknown>,
  activePlanIds: Set<number>,
  purchaseCounts: Map<number, number>,
  quotaPerUnit: number,
): SubscriptionPlan {
  const wrapper = asRecord(value);
  const plan = asRecord(wrapper.plan ?? value);
  const id = requireNumber(plan, "id", "subscription_plan.id");
  const rawUnit = requireString(plan, "duration_unit", "subscription_plan.duration_unit");
  if (!["year", "month", "day", "hour", "custom"].includes(rawUnit)) {
    throw new LiveDataContractError("subscription_plan.duration_unit");
  }
  const durationUnit = rawUnit as SubscriptionPlan["durationUnit"];
  const stripeEnabled = requireBoolean(topup, "enable_stripe_topup", "topup.enable_stripe_topup");
  const creemEnabled = requireBoolean(topup, "enable_creem_topup", "topup.enable_creem_topup");
  const pancakeEnabled = requireBoolean(
    topup,
    "enable_waffo_pancake_topup",
    "topup.enable_waffo_pancake_topup",
  );
  const epayEnabled = requireBoolean(topup, "enable_online_topup", "topup.enable_online_topup");
  const paymentMethods: SubscriptionPaymentMethod[] = [];
  if (requireBoolean(plan, "allow_balance_pay", "subscription_plan.allow_balance_pay")) {
    paymentMethods.push({
      id: "balance",
      name: "Account balance",
      type: "balance",
    });
  }
  if (stripeEnabled && readString(plan, "stripe_price_id")) {
    paymentMethods.push({ id: "stripe", name: "Stripe", type: "stripe" });
  }
  if (creemEnabled && readString(plan, "creem_product_id")) {
    paymentMethods.push({ id: "creem", name: "Creem", type: "creem" });
  }
  if (pancakeEnabled && readString(plan, "waffo_pancake_product_id")) {
    paymentMethods.push({
      id: "waffo_pancake",
      name: "Waffo Pancake",
      type: "waffo_pancake",
    });
  }
  if (epayEnabled) {
    for (const [index, value] of parseList(topup.pay_methods, "topup.pay_methods").entries()) {
      const method = asRecord(value);
      const type = readString(method, "type");
      if (!type || ["creem", "stripe", "waffo", "waffo_pancake"].includes(type)) continue;
      paymentMethods.push({
        id: `epay-${type}-${index}`,
        name: requireString(method, "name", `topup.pay_methods[${index}].name`),
        type: "epay",
        paymentMethod: type,
      });
    }
  }
  const totalAmount = requireNumber(plan, "total_amount", "subscription_plan.total_amount");
  const durationValue = requireNumber(plan, "duration_value", "subscription_plan.duration_value");
  const price = requireNumber(plan, "price_amount", "subscription_plan.price_amount");
  const purchaseLimit = requireNumber(
    plan,
    "max_purchase_per_user",
    "subscription_plan.max_purchase_per_user",
  );
  if (durationValue <= 0) throw new LiveDataContractError("subscription_plan.duration_value");
  if (totalAmount < 0) throw new LiveDataContractError("subscription_plan.total_amount");
  if (price < 0) throw new LiveDataContractError("subscription_plan.price_amount");
  if (purchaseLimit < 0) {
    throw new LiveDataContractError("subscription_plan.max_purchase_per_user");
  }
  return {
    id,
    name: requireString(plan, "title", "subscription_plan.title"),
    price,
    currency: requireString(plan, "currency", "subscription_plan.currency"),
    interval: durationUnit,
    durationUnit,
    durationValue,
    quotaUsd: totalAmount > 0 ? quotaUnitsToUsd(totalAmount, quotaPerUnit) : 0,
    unlimitedQuota: totalAmount === 0,
    quotaResetPeriod: requireString(
      plan,
      "quota_reset_period",
      "subscription_plan.quota_reset_period",
    ),
    features: [readString(plan, "subtitle")].filter(Boolean),
    current: activePlanIds.has(id),
    purchaseCount: purchaseCounts.get(id) ?? 0,
    purchaseLimit,
    paymentMethods,
  };
}

async function getRequestLogsPage(
  input: RequestLogListInput,
): Promise<PaginatedResult<RequestLogRecord>> {
  const search = requestLogSearchParams(input);
  appendPagination(search, input);
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({ path: `/api/log/self?${search.toString()}` }),
    getQuotaPerUnit(),
  ]);
  const page = asRecord(response.data);
  const items: RequestLogRecord[] = [];
  for (const value of requireItems(response.data, "request_logs.items")) {
    const logType = readNumber(asRecord(value), "type");
    if (logType !== LOG_TYPE_CONSUME && logType !== LOG_TYPE_ERROR) continue;

    items.push(mapPricedRequestLog(value, quotaPerUnit));
  }
  return {
    items,
    page: requireNumber(page, "page", "pagination.page"),
    pageSize: requireNumber(page, "page_size", "pagination.page_size"),
    total: requireNumber(page, "total", "pagination.total"),
  };
}

function requestLogSearchParams(input: RequestLogAnalyticsInput): URLSearchParams {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_timestamp: String(unixRange.start),
    end_timestamp: String(unixRange.end),
    scope: "request",
  });
  if (input.status === "succeeded") search.set("type", String(LOG_TYPE_CONSUME));
  if (input.status === "failed") search.set("type", String(LOG_TYPE_ERROR));
  const keyword = input.keyword.trim();
  if (!keyword) return search;
  if (input.searchField === "request") search.set("request_id", keyword);
  if (input.searchField === "service_trace") search.set("upstream_request_id", keyword);
  if (input.searchField === "model") search.set("model_name", toSearchPattern(keyword));
  if (input.searchField === "api_key") search.set("token_name", keyword);
  return search;
}

async function getRequestLogAnalytics(
  input: RequestLogAnalyticsInput,
): Promise<RequestLogAnalytics> {
  const days = dateRangeDayCount(input.range);
  const bucketSeconds = days <= 1 ? 300 : days <= 7 ? 3_600 : days <= 31 ? 21_600 : 86_400;
  const unixRange = dateRangeToUnix(input.range);
  const timezoneOffsetMinutes = input.range.timeZone
    ? timeZoneOffsetMinutesAt(unixRange.start, input.range.timeZone)
    : -new Date(unixRange.start * 1_000).getTimezoneOffset();
  const search = requestLogSearchParams(input);
  search.set("bucket_seconds", String(bucketSeconds));
  search.set("timezone_offset_minutes", String(timezoneOffsetMinutes));
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({
      path: `/api/log/self/usage?${search.toString()}`,
    }),
    getQuotaPerUnit(),
  ]);
  const stats = asRecord(response.data);
  const succeeded = requireNumber(stats, "request_count", "request_log_analytics.request_count");
  const failed = requireNumber(stats, "failure_count", "request_log_analytics.failure_count");
  const totalTokens = requireNumber(stats, "total_tokens", "request_log_analytics.total_tokens");
  const cacheHitTokens = requireNumber(
    stats,
    "cache_hit_tokens",
    "request_log_analytics.cache_hit_tokens",
  );
  const requestCount = succeeded + failed;
  if (succeeded < 0 || failed < 0 || totalTokens < 0 || cacheHitTokens < 0) {
    throw new LiveDataContractError("request_log_analytics.summary");
  }

  const rawSeries = requireItems(stats.series, "request_log_analytics.series").map(
    (value, index) => {
      const point = asRecord(value);
      const bucketStart = requireNumber(
        point,
        "day_start",
        `request_log_analytics.series[${index}].day_start`,
      );
      const pointBucketSeconds = requireNumber(
        point,
        "bucket_seconds",
        `request_log_analytics.series[${index}].bucket_seconds`,
      );
      const pointSucceeded = requireNumber(
        point,
        "request_count",
        `request_log_analytics.series[${index}].request_count`,
      );
      const pointFailed = requireNumber(
        point,
        "failure_count",
        `request_log_analytics.series[${index}].failure_count`,
      );
      const tokens = requireNumber(
        point,
        "total_tokens",
        `request_log_analytics.series[${index}].total_tokens`,
      );
      const pointCacheHitTokens = requireNumber(
        point,
        "cache_hit_tokens",
        `request_log_analytics.series[${index}].cache_hit_tokens`,
      );
      const pointCacheHitRate = readOptionalNumber(point, "cache_hit_rate");
      const quota = requireNumber(point, "quota", `request_log_analytics.series[${index}].quota`);
      if (
        bucketStart <= 0 ||
        pointBucketSeconds !== bucketSeconds ||
        pointSucceeded < 0 ||
        pointFailed < 0 ||
        tokens < 0 ||
        pointCacheHitTokens < 0 ||
        (pointCacheHitRate !== null && (pointCacheHitRate < 0 || pointCacheHitRate > 1)) ||
        quota < 0
      ) {
        throw new LiveDataContractError(`request_log_analytics.series[${index}]`);
      }
      const bucketMinutes = pointBucketSeconds / 60;
      return {
        bucketStart,
        bucketSeconds: pointBucketSeconds,
        succeeded: pointSucceeded,
        failed: pointFailed,
        rpm: (pointSucceeded + pointFailed) / bucketMinutes,
        tpm: tokens / bucketMinutes,
        tokens,
        cost: quotaUnitsToUsd(quota, quotaPerUnit),
        cacheHitTokens: pointCacheHitTokens,
        cacheHitRate: pointCacheHitRate === null ? null : pointCacheHitRate * 100,
      };
    },
  );
  if (requestCount > 0 && rawSeries.length === 0) {
    throw new LiveDataContractError("request_log_analytics.series");
  }

  const offsetSeconds = timezoneOffsetMinutes * 60;
  const firstBucket =
    Math.floor((unixRange.start + offsetSeconds) / bucketSeconds) * bucketSeconds - offsetSeconds;
  const lastBucket =
    Math.floor((unixRange.end + offsetSeconds) / bucketSeconds) * bucketSeconds - offsetSeconds;
  const pointsByStart = new Map(rawSeries.map((point) => [point.bucketStart, point]));
  const series: RequestLogAnalytics["series"] = [];
  for (let bucketStart = firstBucket; bucketStart <= lastBucket; bucketStart += bucketSeconds) {
    series.push(
      pointsByStart.get(bucketStart) ?? {
        bucketStart,
        bucketSeconds,
        succeeded: 0,
        failed: 0,
        rpm: 0,
        tpm: 0,
        tokens: 0,
        cost: 0,
        cacheHitTokens: 0,
        cacheHitRate: null,
      },
    );
  }

  const failureRate =
    requestCount > 0
      ? requireNumber(stats, "failure_rate", "request_log_analytics.failure_rate") * 100
      : null;
  const rawCacheHitRate = readOptionalNumber(stats, "cache_hit_rate");
  const cacheHitRate = rawCacheHitRate === null ? null : rawCacheHitRate * 100;
  const peakRpm = requireNumber(stats, "peak_rpm", "request_log_analytics.peak_rpm");
  const peakTpm = requireNumber(stats, "peak_tpm", "request_log_analytics.peak_tpm");
  const quota = requireNumber(stats, "quota", "request_log_analytics.quota");
  if (
    (failureRate !== null && (failureRate < 0 || failureRate > 100)) ||
    (cacheHitRate !== null && (cacheHitRate < 0 || cacheHitRate > 100)) ||
    peakRpm < 0 ||
    peakTpm < 0 ||
    quota < 0
  ) {
    throw new LiveDataContractError("request_log_analytics.summary");
  }

  return {
    requestCount,
    failureCount: failed,
    failureRate,
    peakRpm,
    peakTpm,
    totalTokens,
    totalCost: quotaUnitsToUsd(quota, quotaPerUnit),
    cacheHitTokens,
    cacheHitRate,
    series,
  };
}

async function getRequestLog(requestId: string): Promise<RequestLogRecord> {
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) throw new LiveDataContractError("request_log.request_id");
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({
      path: `/api/log/self/detail/${encodeURIComponent(normalizedRequestId)}`,
    }),
    getQuotaPerUnit(),
  ]);
  return mapPricedRequestLog(response.data, quotaPerUnit);
}

async function getAccountActivityPage(
  input: AccountActivityListInput,
): Promise<PaginatedResult<AccountActivityRecord>> {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_timestamp: String(unixRange.start),
    end_timestamp: String(unixRange.end),
    scope: "activity",
  });
  appendPagination(search, input);
  if (input.type === "management") search.set("type", String(LOG_TYPE_MANAGE));
  if (input.type === "system") search.set("type", String(LOG_TYPE_SYSTEM));
  if (input.type === "login") search.set("type", String(LOG_TYPE_LOGIN));
  const response = await client.request<unknown>({
    path: `/api/log/self?${search.toString()}`,
  });
  return mapPaginatedResult(response.data, input, mapAccountActivity);
}

async function getBillingLedgerPage(
  input: BillingLedgerListInput,
): Promise<PaginatedResult<BillingLedgerEntry>> {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_timestamp: String(unixRange.start),
    end_timestamp: String(unixRange.end),
    scope: "billing",
  });
  appendPagination(search, input);
  if (input.type === "topup") search.set("type", String(LOG_TYPE_TOPUP));
  if (input.type === "refund") search.set("type", String(LOG_TYPE_REFUND));
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({ path: `/api/log/self?${search.toString()}` }),
    getQuotaPerUnit(),
  ]);
  const page = asRecord(response.data);
  return {
    items: requireItems(response.data, "billing_ledger.items").map((value) => {
      const entry = mapBillingLedgerEntry(value);
      const { amountQuota, ...publicEntry } = entry;
      return {
        ...publicEntry,
        amountUsd: amountQuota === null ? null : quotaUnitsToUsd(amountQuota, quotaPerUnit),
      };
    }),
    page: requireNumber(page, "page", "pagination.page"),
    pageSize: requireNumber(page, "page_size", "pagination.page_size"),
    total: requireNumber(page, "total", "pagination.total"),
  };
}

async function getTasksPage(input: TaskListInput): Promise<PaginatedResult<TaskRecord>> {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_timestamp: String(unixRange.start),
    end_timestamp: String(unixRange.end),
  });
  appendPagination(search, input);
  if (input.status !== "all") search.set("status_group", input.status);
  if (input.type !== "all") search.set("task_type", input.type);
  const [response, quotaPerUnit] = await Promise.all([
    client.request<unknown>({ path: `/api/task/self?${search.toString()}` }),
    getQuotaPerUnit(),
  ]);
  return mapPaginatedResult(response.data, input, (value) =>
    mapLiveTaskRecord(value, quotaPerUnit),
  );
}

async function getTaskTypeCounts(
  input: Omit<TaskListInput, "page" | "pageSize" | "type">,
): Promise<TaskTypeCounts> {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_timestamp: String(unixRange.start),
    end_timestamp: String(unixRange.end),
    include_type_counts: "true",
  });
  appendPagination(search, { ...input, page: 1, pageSize: 1 });
  if (input.status !== "all") search.set("status_group", input.status);
  const response = await client.request<unknown>({
    path: `/api/task/self?${search.toString()}`,
  });
  const counts = asRecord(asRecord(response.data).type_counts);
  return {
    all: requireNumber(counts, "all", "task_type_counts.all"),
    image: requireNumber(counts, "image", "task_type_counts.image"),
    video: requireNumber(counts, "video", "task_type_counts.video"),
    audio: requireNumber(counts, "audio", "task_type_counts.audio"),
  };
}

async function getBillingTransactionsPage(
  input: BillingTransactionListInput,
): Promise<PaginatedResult<BillingTransaction>> {
  const unixRange = dateRangeToUnix(input.range);
  const search = new URLSearchParams({
    start_time: String(unixRange.start),
    end_time: String(unixRange.end),
  });
  appendPagination(search, input);
  const keyword = input.keyword.trim();
  if (keyword) search.set("keyword", toSearchPattern(keyword));
  if (input.status !== "all") {
    search.set(
      "status",
      { completed: "success", failed: "failed", pending: "pending" }[input.status],
    );
  }
  if (input.type !== "all") {
    search.set("order_type", input.type === "subscription" ? "subscription" : "wallet");
  }
  const response = await client.request<unknown>({
    path: `/api/user/topup/self?${search.toString()}`,
  });
  return mapPaginatedResult(response.data, input, mapBillingTransaction);
}

export const liveRepository: ConsoleRepository = {
  ...liveSessionRepository,
  async getOverview(range: DateRangeValue) {
    const unixRange = dateRangeToUnix(range);
    const [user, keys, recentActivity, statsResponse, quotaPerUnit] = await Promise.all([
      getUser(),
      listApiKeys(),
      getRecentActivity(range),
      client.request<unknown>({
        path: `/api/log/self/stat?start_timestamp=${unixRange.start}&end_timestamp=${unixRange.end}`,
      }),
      getQuotaPerUnit(),
    ]);
    const summary = mapUsageSummary(statsResponse.data);
    return {
      availableBalance: quotaUnitsToUsd(user.quotaUnits, quotaPerUnit),
      requestCount: summary.requestCount,
      activeApiKeys: keys.filter((item) => item.status === "active").length,
      successRate: summary.successRate,
      recentActivity,
    };
  },
  async getOnboarding() {
    const [user, keys] = await Promise.all([getUser(), listApiKeys()]);
    const models = await liveRepository.listPlaygroundModels(user.group);
    return {
      steps: [
        { id: "create-key", complete: keys.length > 0 },
        { id: "fund-account", complete: user.quotaUnits > 0 },
        { id: "first-request", complete: user.requestCount > 0 },
      ],
      exampleModel: models[0]?.id ?? null,
      baseUrl: `${publicApiBaseUrl()}/v1`,
    };
  },
  listApiKeys,
  getApiKeysPage,
  async listApiKeyGroups(): Promise<ApiKeyGroupOption[]> {
    const response = await client.request<unknown>({
      path: "/api/user/self/groups",
    });
    const groups = asRecord(response.data);
    return Object.entries(groups)
      .map(([value, rawGroup]) => {
        if (!value.trim() || !rawGroup || typeof rawGroup !== "object") {
          throw new LiveDataContractError(`user.groups.${value || "unknown"}`);
        }
        const group = asRecord(rawGroup);
        const rawRatio = group.ratio;
        return {
          value,
          description: readString(group, "desc") || null,
          ratio: typeof rawRatio === "number" || typeof rawRatio === "string" ? rawRatio : null,
        };
      })
      .sort((left, right) => {
        if (left.value === "default") return -1;
        if (right.value === "default") return 1;
        if (left.value === "auto") return -1;
        if (right.value === "auto") return 1;
        return left.value.localeCompare(right.value);
      });
  },
  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const quotaPerUnit = await getQuotaPerUnit();
    const response = await client.request<unknown>({
      path: "/api/token/",
      method: "POST",
      body: {
        name: input.name,
        remain_quota: input.unlimitedQuota
          ? 0
          : usdToQuotaUnits(input.quotaUsd, quotaPerUnit, "api_key.quota_usd"),
        expired_time: input.expiresAt ?? -1,
        unlimited_quota: input.unlimitedQuota,
        model_limits_enabled: input.allowedModels.length > 0,
        model_limits: input.allowedModels.join(","),
        allow_ips: input.allowedIps.join(","),
        group: input.group,
        auto_groups: [],
        cross_group_retry: false,
      },
    });
    const record = mapApiKey(response.data, quotaPerUnit);
    const rawSecret = requireString(asRecord(response.data), "key", "api_key.secret");
    const secret = rawSecret && !rawSecret.startsWith("sk-") ? `sk-${rawSecret}` : rawSecret;
    return { record, secret };
  },
  async updateApiKey(input: UpdateApiKeyInput) {
    const quotaPerUnit = await getQuotaPerUnit();
    const response = await client.request<unknown>({
      path: "/api/token/",
      method: "PUT",
      body: {
        id: input.id,
        name: input.name,
        expired_time: input.expiresAt ?? -1,
        remain_quota: input.unlimitedQuota
          ? 0
          : usdToQuotaUnits(input.remainingQuotaUsd, quotaPerUnit, "api_key.remaining_quota_usd"),
        unlimited_quota: input.unlimitedQuota,
        model_limits_enabled: input.allowedModels.length > 0,
        model_limits: input.allowedModels.join(","),
        allow_ips: input.allowedIps.join(","),
        group: input.group,
        auto_groups: [],
        cross_group_retry: false,
      },
    });
    return mapApiKey(response.data, quotaPerUnit);
  },
  async setApiKeyEnabled(id: number, enabled: boolean) {
    const [response, quotaPerUnit] = await Promise.all([
      client.request<unknown>({
        path: "/api/token/?status_only=true",
        method: "PUT",
        body: { id, status: enabled ? 1 : 2 },
      }),
      getQuotaPerUnit(),
    ]);
    return mapApiKey(response.data, quotaPerUnit);
  },
  async revokeApiKey(id: number) {
    await client.request({ path: `/api/token/${id}`, method: "DELETE" });
  },
  async listPlaygroundModels(group: string) {
    if (!group.trim()) throw new LiveDataContractError("user.group");
    const response = await client.request<unknown>({
      path: `/api/user/models?group=${encodeURIComponent(group)}&details=true`,
    });
    return requireItems(response.data, "user.models").map((model, index) => {
      const item = asRecord(model);
      const id = requireString(item, "id", `user.models[${index}].id`);
      const supportedEndpointTypes = readOptionalItems(
        item.supported_endpoint_types,
        `user.models[${index}].supported_endpoint_types`,
      ).map((endpoint, endpointIndex) => {
        if (typeof endpoint !== "string" || !endpoint.trim()) {
          throw new LiveDataContractError(
            `user.models[${index}].supported_endpoint_types[${endpointIndex}]`,
          );
        }
        return endpoint;
      });
      return { id, label: id, group, supportedEndpointTypes };
    });
  },
  async sendPlaygroundMessage(
    input: PlaygroundMessageInput,
    signal?: AbortSignal,
  ): Promise<PlaygroundReply> {
    const startedAt = performance.now();
    const payload = await client.requestRaw<unknown>({
      path: "/pg/chat/completions",
      method: "POST",
      signal,
      body: {
        model: input.model,
        group: input.group,
        messages: [
          ...(input.systemPrompt.trim()
            ? [{ role: "system", content: input.systemPrompt.trim() }]
            : []),
          ...input.messages,
        ],
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        stream: false,
      },
    });
    const data = asRecord(payload);
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = asRecord(choices[0]);
    const message = asRecord(firstChoice.message);
    const usage = asRecord(data.usage);
    const content = requireString(message, "content", "playground.choices[0].message.content");
    return {
      id: requireString(data, "id", "playground.id"),
      content,
      model: readString(data, "model") || null,
      inputTokens: readOptionalNumber(usage, "prompt_tokens"),
      outputTokens: readOptionalNumber(usage, "completion_tokens"),
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      estimatedCost: readOptionalNumber(data, "cost"),
    };
  },
  async generatePlaygroundImages(
    input: PlaygroundImageGenerationInput,
    signal?: AbortSignal,
  ): Promise<PlaygroundImageGeneration> {
    const payload = await client.requestRaw<unknown>({
      path: "/pg/images/generations",
      method: "POST",
      signal,
      body: {
        group: input.group,
        model: input.model,
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        n: input.count,
      },
    });
    const data = asRecord(payload);
    const images = requireItems(data.data, "playground.images.data").map((value, index) => {
      const image = asRecord(value);
      const url = readString(image, "url");
      const b64Json = readString(image, "b64_json");
      if (!url && !b64Json) {
        throw new LiveDataContractError(`playground.images.data[${index}]`);
      }
      return {
        url: url
          ? requirePlaygroundMediaUrl(url, `playground.images.data[${index}].url`)
          : `data:image/png;base64,${b64Json}`,
        revisedPrompt: readString(image, "revised_prompt") || null,
        transient: !url,
      };
    });
    return {
      createdAt: readOptionalNumber(data, "created"),
      images,
    };
  },
  async createPlaygroundVideo(
    input: PlaygroundVideoGenerationInput,
    signal?: AbortSignal,
  ): Promise<PlaygroundVideoGeneration> {
    const payload = await client.requestRaw<unknown>({
      path: "/pg/videos",
      method: "POST",
      signal,
      body: {
        group: input.group,
        model: input.model,
        prompt: input.prompt,
        duration: input.duration,
        resolution: input.resolution,
        aspect_ratio: input.aspectRatio,
        generate_audio: input.generateAudio,
      },
    });
    return mapPlaygroundVideo(payload);
  },
  async getPlaygroundVideo(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<PlaygroundVideoGeneration> {
    if (!taskId.trim()) throw new LiveDataContractError("playground.video.task_id");
    const payload = await client.requestRaw<unknown>({
      path: `/pg/videos/${encodeURIComponent(taskId)}`,
      signal,
    });
    return mapPlaygroundVideo(payload);
  },
  async getUsage(range: DateRangeValue): Promise<UsageData> {
    const unixRange = dateRangeToUnix(range);
    const timezoneOffsetMinutes = -new Date().getTimezoneOffset();
    const [usageResponse, logs, quotaPerUnit] = await Promise.all([
      client.request<unknown>({
        path: `/api/log/self/usage?start_timestamp=${unixRange.start}&end_timestamp=${unixRange.end}&timezone_offset_minutes=${timezoneOffsetMinutes}`,
      }),
      getRecentActivity(range),
      getQuotaPerUnit(),
    ]);
    return mapUsageAnalytics(usageResponse.data, range, quotaPerUnit, logs);
  },
  async getIntegration(): Promise<IntegrationData> {
    await client.request<unknown>({
      path: "/api/status",
      authenticated: false,
    });
    return {
      baseUrl: `${publicApiBaseUrl()}/v1`,
      apiVersion: null,
      region: null,
      serviceStatus: "reachable",
      endpoints: [
        {
          name: "Chat Completions",
          method: "POST",
          path: "/v1/chat/completions",
          description: "OpenAI-compatible text and multimodal chat.",
        },
        {
          name: "Responses",
          method: "POST",
          path: "/v1/responses",
          description: "Unified response API with tools and structured output.",
        },
        {
          name: "Embeddings",
          method: "POST",
          path: "/v1/embeddings",
          description: "Create vector embeddings for search and retrieval.",
        },
      ],
    };
  },
  async listModelCatalog(group: string): Promise<ModelCatalogItem[]> {
    if (!group.trim()) throw new LiveDataContractError("user.group");
    const [modelsResponse, pricingResponse] = await Promise.all([
      client.request<unknown>({
        path: `/api/user/models?group=${encodeURIComponent(group)}`,
      }),
      client.request<unknown>({ path: "/api/pricing" }),
    ]);
    const pricingEnvelope = asRecord(pricingResponse);
    const vendorNamesById = new Map<number, string>();
    for (const value of readItems(pricingEnvelope.vendors)) {
      const vendor = asRecord(value);
      const id = readNumber(vendor, "id", Number.NaN);
      const name = readString(vendor, "name").trim();
      if (Number.isInteger(id) && id > 0 && name) vendorNamesById.set(id, name);
    }
    const pricedModels = requireItems(pricingResponse.data, "pricing.models").map((model) =>
      mapCatalogModel(model, group, vendorNamesById),
    );
    if (pricedModels.length > 0) return pricedModels;
    return requireItems(modelsResponse.data, "user.models").map((model, index) => {
      if (typeof model !== "string" || !model.trim()) {
        throw new LiveDataContractError(`user.models[${index}]`);
      }
      return {
        id: model,
        provider: null,
        description: null,
        family: "unknown",
        contextWindow: null,
        maxOutputTokens: null,
        limitsSourceUrl: null,
        limitsVerifiedAt: null,
        inputPrice: null,
        inputPriceQualifier: null,
        inputPriceUnit: null,
        outputPrice: null,
        outputPriceQualifier: null,
        outputPriceUnit: null,
        currency: null,
        pricingAvailable: false,
        pricingSource: null,
        accountPriceSource: null,
        accountPrice: null,
        officialPrice: null,
        available: true,
        availabilityStatus: null,
        features: [],
        supportedEndpointTypes: [],
      };
    });
  },
  getRequestLog,
  getRequestLogAnalytics,
  getRequestLogsPage,
  getAccountActivityPage,
  getBillingLedgerPage,
  async getAlertCenter(): Promise<AlertCenterData> {
    const [preferences, platform] = await Promise.all([
      getAccountPreferences(),
      client
        .request<unknown>({ path: "/api/uptime/status", authenticated: false })
        .then((response) => mapPlatformStatus(response.data))
        .catch((): AlertCenterData["platform"] => ({
          configured: null,
          monitors: [],
          status: "unknown",
          uptimePercent: null,
        })),
    ]);
    return {
      platform,
      rules: [
        {
          id: "balance-warning",
          type: "balance",
          name: "Low balance",
          threshold: preferences.balanceWarningThresholdUsd,
          channel: preferences.notifyType,
          enabled: null,
          lastTriggeredAt: null,
        },
      ],
      incidents: [],
    };
  },
  async listTeamMembers(): Promise<TeamMember[]> {
    return [];
  },
  getTasksPage,
  getTaskTypeCounts,
  getBilling: getBillingData,
  getBillingTransactionsPage,
  async redeemCode(code: string) {
    await client.request({
      path: "/api/user/topup",
      method: "POST",
      body: { key: code },
    });
    return getBillingData();
  },
  getRechargeConfiguration,
  getRechargeQuote,
  createRechargeCheckout,
  purchaseSubscription,
  getPaymentConfirmation,
  getAccount: getAccountData,
  async updateProfile(input: UpdateProfileInput) {
    await client.request({
      path: "/api/user/self",
      method: "PUT",
      body: {
        username: input.username,
        display_name: input.displayName,
        email: input.email,
        verification_code: input.verificationCode,
      },
    });
    return getAccountData();
  },
  async changePassword(input: ChangePasswordInput) {
    const response = await client.request<unknown>({
      path: "/api/user/self",
      method: "PUT",
      body: {
        original_password: input.currentPassword,
        password: input.newPassword,
      },
    });
    return securityResult(response.data);
  },
  async updatePreferences(input: AccountPreferences) {
    if (
      input.balanceWarningThresholdUsd === null ||
      !Number.isFinite(input.balanceWarningThresholdUsd) ||
      input.balanceWarningThresholdUsd <= 0
    ) {
      throw new LiveDataContractError("account.balance_warning_threshold_usd");
    }
    if (input.notifyType === null) {
      throw new LiveDataContractError("account.notify_type");
    }
    const quotaPerUnit = await getQuotaPerUnit();
    await client.request({
      path: "/api/user/setting",
      method: "PUT",
      body: {
        bark_url: input.barkUrl,
        gotify_priority: input.gotifyPriority,
        gotify_token: input.gotifyToken,
        gotify_url: input.gotifyUrl,
        notify_type: input.notifyType,
        notification_email: input.notificationEmail,
        quota_warning_threshold: usdToQuotaUnits(
          input.balanceWarningThresholdUsd,
          quotaPerUnit,
          "account.balance_warning_threshold_usd",
        ),
        record_ip_log: input.recordIpForced || input.recordIpLog,
        webhook_secret: input.webhookSecret,
        webhook_url: input.webhookUrl,
      },
    });
    return getAccountData();
  },
  async revokeSession(id: string) {
    await client.request({
      path: `/api/user/sessions/${encodeURIComponent(id)}`,
      method: "DELETE",
    });
    return getAccountData();
  },
  async revokeOtherSessions() {
    const response = await client.request<unknown>({
      path: "/api/user/sessions/revoke-others",
      method: "POST",
    });
    return {
      account: await getAccountData(),
      revokedCount: requireNumber(
        asRecord(response.data),
        "revoked_count",
        "sessions.revoked_count",
      ),
    };
  },
  async setupTwoFactor(): Promise<TwoFactorSetup> {
    const response = await client.request<unknown>({
      path: "/api/user/2fa/setup",
      method: "POST",
    });
    const setup = asRecord(response.data);
    const backupCodes = requireItems(setup.backup_codes, "two_factor.backup_codes");
    if (!backupCodes.every((value): value is string => typeof value === "string" && value !== "")) {
      throw new LiveDataContractError("two_factor.backup_codes");
    }
    return {
      backupCodes,
      qrCodeData: requireString(setup, "qr_code_data", "two_factor.qr_code_data"),
      secret: requireString(setup, "secret", "two_factor.secret"),
    };
  },
  async enableTwoFactor(code: string) {
    const response = await client.request<unknown>({
      path: "/api/user/2fa/enable",
      method: "POST",
      body: { code: code.trim() },
    });
    return securityResult(response.data);
  },
  async disableTwoFactor(code: string) {
    const response = await client.request<unknown>({
      path: "/api/user/2fa/disable",
      method: "POST",
      body: { code: code.trim() },
    });
    return securityResult(response.data);
  },
  async regenerateTwoFactorBackupCodes(code: string): Promise<TwoFactorBackupCodesResult> {
    const response = await client.request<unknown>({
      path: "/api/user/2fa/backup_codes",
      method: "POST",
      body: { code: code.trim() },
    });
    const payload = asRecord(response.data);
    const result = await securityResult(payload);
    const backupCodes = requireItems(payload.backup_codes, "two_factor.backup_codes");
    if (!backupCodes.every((value): value is string => typeof value === "string" && value !== "")) {
      throw new LiveDataContractError("two_factor.backup_codes");
    }
    return {
      ...result,
      backupCodes,
    };
  },
  async registerPasskey(twoFactorCode?: string) {
    const proof = twoFactorCode
      ? await createTwoFactorProof("passkey.register", twoFactorCode)
      : undefined;
    return registerPasskey(proof);
  },
  async removePasskey(twoFactorCode?: string) {
    const proof = twoFactorCode
      ? await createTwoFactorProof("passkey.delete", twoFactorCode)
      : await createPasskeyProof("passkey.delete");
    const response = await client.request<unknown>({
      path: "/api/user/passkey",
      method: "DELETE",
      headers: securityProofHeaders(proof),
    });
    return securityResult(response.data);
  },
  async createEVMWalletSecurityProof(method, scope, code) {
    if (method === "passkey") return createPasskeyProof(scope);
    if (!code?.trim()) throw new Error("Security verification is required.");
    const response = await client.request<unknown>({
      path: "/api/verify",
      method: "POST",
      body: { method, scope, code: code.trim() },
    });
    const proof = readString(asRecord(response.data), "proof_token");
    if (!proof) throw new Error("The server did not return a security proof.");
    return proof;
  },
  async beginEVMWalletBinding(input) {
    const begin = await client.request<unknown>({
      path: "/api/user/evm-wallet/bind/begin",
      method: "POST",
      headers: securityProofHeaders(input.proof),
      body: { address: input.address, chain_id: String(input.chainId) },
    });
    return mapEVMWalletChallenge(begin.data);
  },
  async completeEVMWalletBinding(input) {
    const response = await client.request<unknown>({
      path: "/api/user/evm-wallet/bind/finish",
      method: "POST",
      headers: securityProofHeaders(input.proof),
      body: { flow_token: input.flowToken, signature: input.signature },
    });
    return securityResult(response.data);
  },
  async removeEVMWallet(proof) {
    const response = await client.request<unknown>({
      path: "/api/user/evm-wallet",
      method: "DELETE",
      headers: securityProofHeaders(proof),
    });
    return securityResult(response.data);
  },
  async beginEVMWalletPasswordSetup(input) {
    const response = await client.request<unknown>({
      path: "/api/user/evm-wallet/password/begin",
      method: "POST",
      body: { address: input.address, chain_id: String(input.chainId) },
    });
    return mapEVMWalletChallenge(response.data);
  },
  async completeEVMWalletPasswordSetup(input) {
    const response = await client.request<unknown>({
      path: "/api/user/evm-wallet/password/finish",
      method: "POST",
      body: {
        flow_token: input.flowToken,
        signature: input.signature,
        password: input.newPassword,
      },
    });
    return securityResult(response.data);
  },
};
