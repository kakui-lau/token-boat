import type {
  AdminRequestListInput,
  AdminRequestLog,
  AdminRequestSummary,
  AdminRequestWorkspace,
} from "./contracts";

const consumeLogType = 2;
const errorLogType = 5;

export function requestListSearch(input: AdminRequestListInput): URLSearchParams {
  const search = requestFilterSearch(input);
  search.set("scope", "request");
  search.set("order", input.order);
  search.set("p", String(input.page));
  search.set("page_size", String(input.pageSize));
  return search;
}

export function requestStatSearch(input: AdminRequestListInput): URLSearchParams {
  const search = requestFilterSearch(input);
  search.set("scope", "request");
  return search;
}

export function mapAdminRequestWorkspace(
  pageValue: unknown,
  statValue: unknown,
  input: Pick<AdminRequestListInput, "page" | "pageSize">,
): AdminRequestWorkspace {
  const page = record(pageValue, "request logs");
  const items = array(page.items, "request logs.items").map(mapAdminRequestLog);
  return {
    items,
    page: optionalNumber(page.page) ?? input.page,
    pageSize: optionalNumber(page.page_size) ?? input.pageSize,
    summary: mapAdminRequestSummary(statValue),
    total: requiredNumber(page.total, "request logs.total"),
  };
}

export function mapAdminRequestLog(value: unknown): AdminRequestLog {
  const log = record(value, "request log");
  const id = requiredNumber(log.id, "request log.id");
  const logType = requiredNumber(log.type, "request log.type");
  if (logType !== consumeLogType && logType !== errorLogType) {
    throw new Error("Invalid request log.type response.");
  }

  const statusCode = optionalNumber(log.status_code);
  const failed = logType === errorLogType || (statusCode !== null && statusCode >= 400);
  const latencyMs = nonNegativeNumber(log.latency_ms);
  const costUsd = nonNegativeNumber(log.cost_usd);

  return {
    apiKeyName: optionalString(log.api_key_name),
    channelId: positiveInteger(log.channel_id),
    channelName: optionalString(log.channel_name),
    costUsd,
    createdAt: requiredNumber(log.created_at, "request log.created_at"),
    endpoint: optionalString(log.endpoint),
    errorCode: failed ? optionalString(log.error_code) : null,
    errorMessage: failed ? limitedString(log.error_message, 1_000) : null,
    firstTokenLatencyMs: nonNegativeNumber(log.first_token_latency_ms),
    group: optionalString(log.group),
    id,
    inputTokens: nonNegativeNumber(log.prompt_tokens) ?? 0,
    isStream: log.is_stream === true,
    latencyMs,
    model: optionalString(log.model_name),
    outputTokens: nonNegativeNumber(log.completion_tokens) ?? 0,
    requestId: optionalString(log.request_id) ?? `log-${id}`,
    serviceTraceId: optionalString(log.upstream_request_id),
    sourceIp: optionalString(log.source_ip),
    status: failed ? "failed" : "succeeded",
    statusCode,
    taskId: optionalString(log.task_id),
    username: optionalString(log.username) ?? "—",
  };
}

export function mapAdminRequestSummary(value: unknown): AdminRequestSummary {
  const summary = record(value, "request summary");
  const succeededCount = nonNegativeNumber(summary.request_count) ?? 0;
  const failedCount = nonNegativeNumber(summary.failure_count) ?? 0;
  const requestCount = succeededCount + failedCount;
  const failureRate = optionalNumber(summary.failure_rate);
  const cacheHitRate = optionalNumber(summary.cache_hit_rate);
  return {
    cacheHitRate:
      cacheHitRate !== null && cacheHitRate >= 0 && cacheHitRate <= 1 ? cacheHitRate : null,
    costUsd: nonNegativeNumber(summary.cost_usd),
    failedCount,
    failureRate:
      requestCount > 0 && failureRate !== null && failureRate >= 0 && failureRate <= 1
        ? failureRate
        : null,
    peakRpm: nonNegativeNumber(summary.peak_rpm) ?? 0,
    peakTpm: nonNegativeNumber(summary.peak_tpm) ?? 0,
    requestCount,
    succeededCount,
    totalTokens: nonNegativeNumber(summary.total_tokens) ?? 0,
  };
}

function requestFilterSearch(input: AdminRequestListInput): URLSearchParams {
  const search = new URLSearchParams({
    start_timestamp: String(input.range.startTimestamp),
    end_timestamp: String(input.range.endTimestamp),
  });
  if (input.status === "succeeded") search.set("type", String(consumeLogType));
  if (input.status === "failed") search.set("type", String(errorLogType));

  const keyword = input.keyword.trim();
  if (!keyword) return search;
  if (input.searchField === "request") search.set("request_id", keyword);
  if (input.searchField === "service_trace") search.set("upstream_request_id", keyword);
  if (input.searchField === "api_key") search.set("token_name", keyword);
  if (input.searchField === "model") search.set("model_name", fuzzyPattern(keyword));
  if (input.searchField === "username") search.set("username", fuzzyPattern(keyword));
  return search;
}

function fuzzyPattern(value: string): string {
  const normalized = value.replaceAll("%", "").trim();
  return normalized.length >= 2 ? `%${normalized}%` : normalized;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field} response.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid ${field} response.`);
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field} response.`);
  }
  return value;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function limitedString(value: unknown, limit: number): string | null {
  const text = optionalString(value);
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
