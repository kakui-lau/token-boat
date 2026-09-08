import type {
  AdminTask,
  AdminTaskListInput,
  AdminTaskPage,
  AdminTaskRefundResult,
  AdminTaskStatusFilter,
  AdminTaskTypeFilter,
} from "./contracts";

export function taskListSearch(input: AdminTaskListInput): URLSearchParams {
  const search = new URLSearchParams({
    start_timestamp: String(input.range.startTimestamp),
    end_timestamp: String(input.range.endTimestamp),
    order: input.order,
    p: String(input.page),
    page_size: String(input.pageSize),
    view: "summary",
  });
  if (input.keyword.trim()) search.set("task_id", input.keyword.trim());
  if (input.status !== "all") search.set("status_group", input.status);
  if (input.type !== "all") search.set("task_type", input.type);
  if (input.channelId.trim()) search.set("channel_id", input.channelId.trim());
  return search;
}

export function mapAdminTaskPage(
  value: unknown,
  input: Pick<AdminTaskListInput, "page" | "pageSize">,
): AdminTaskPage {
  const page = record(value, "tasks");
  return {
    items: array(page.items, "tasks.items").map(mapAdminTask),
    page: optionalNumber(page.page) ?? input.page,
    pageSize: optionalNumber(page.page_size) ?? input.pageSize,
    total: requiredNumber(page.total, "tasks.total"),
  };
}

export function mapAdminTask(value: unknown): AdminTask {
  const task = record(value, "task");
  const id = requiredNumber(task.id, "task.id");
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid task.id response.");

  const status = mapTaskStatus(optionalString(task.status));
  const taskId = optionalString(task.task_id);
  const model = optionalString(task.model);
  const platform = optionalString(task.platform);
  const action = optionalString(task.action);
  const prompt = optionalString(task.prompt_preview);
  const rawProgress = Number.parseFloat(String(task.progress ?? "").replace("%", ""));
  const progress =
    status === "succeeded"
      ? 100
      : Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(rawProgress, 100))
        : null;
  const createdAt =
    positiveNumber(task.submit_time) ?? requiredNumber(task.created_at, "task.created_at");
  const billingRecord = parseRecord(task.admin_billing);
  const billing =
    Object.keys(billingRecord).length === 0
      ? null
      : {
          auditError: limitedString(billingRecord.billing_audit_error, 500),
          auditStatus: optionalString(billingRecord.billing_audit_status),
          refundStatus: optionalString(billingRecord.refund_status),
          refundedUsd: nonNegativeNumber(billingRecord.refunded_usd),
          settlementError: limitedString(billingRecord.settlement_error, 500),
          settlementStatus: optionalString(billingRecord.settlement_status),
          settlementTargetUsd: nonNegativeNumber(billingRecord.settlement_target_usd),
        };

  return {
    action,
    billing,
    canFailAndRefund:
      taskId !== null &&
      (status === "processing" ||
        status === "queued" ||
        (status === "failed" && billing?.refundStatus !== "completed")),
    channelId: optionalNumber(task.channel_id) ?? 0,
    completedAt: positiveNumber(task.finish_time),
    costUsd: nonNegativeNumber(task.cost_usd),
    createdAt,
    failureReason: limitedString(task.fail_reason, 1_000),
    group: optionalString(task.group),
    id,
    model,
    platform,
    progress,
    promptPreview: limitedString(prompt, 240),
    startedAt: positiveNumber(task.start_time),
    status,
    taskId,
    type: mapTaskType(optionalString(task.task_type)),
    userId: optionalNumber(task.user_id) ?? 0,
    username: optionalString(task.username),
  };
}

export function mapAdminTaskRefundResult(value: unknown): AdminTaskRefundResult {
  const result = record(value, "task refund");
  return {
    alreadyRefunded: result.already_refunded === true,
    refundedUsd: nonNegativeNumber(result.refunded_usd),
    taskId: requiredString(result.task_id, "task refund.task_id"),
  };
}

function mapTaskStatus(value: string | null): AdminTaskStatusFilter | "unknown" {
  switch (value?.toUpperCase()) {
    case "NOT_START":
    case "SUBMITTED":
    case "QUEUED":
      return "queued";
    case "IN_PROGRESS":
      return "processing";
    case "SUCCESS":
      return "succeeded";
    case "FAILURE":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      return "unknown";
  }
}

function mapTaskType(value: string | null): AdminTaskTypeFilter | "unknown" {
  if (value === "audio" || value === "image" || value === "video") return value;
  return "unknown";
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
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

function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new Error(`Invalid ${field} response.`);
  return parsed;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === null) throw new Error(`Invalid ${field} response.`);
  return parsed;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function limitedString(value: unknown, limit: number): string | null {
  const text = optionalString(value);
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}
