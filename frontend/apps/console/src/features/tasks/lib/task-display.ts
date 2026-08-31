import type { TaskRecord, TaskStatus, TaskType } from "@/data/contracts";
import { formatCurrency, formatNumber } from "@/lib/format";

export type TaskTypeFilter = "all" | TaskType;

export function taskTypeLabel(type: TaskTypeFilter): string {
  switch (type) {
    case "image":
      return "Image tasks";
    case "video":
      return "Video tasks";
    case "audio":
      return "Audio tasks";
    case "unknown":
      return "Unknown task type";
    default:
      return "All tasks";
  }
}

export function taskStatusLabel(status: "all" | TaskStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Processing";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "unknown":
      return "Unknown";
    default:
      return "All statuses";
  }
}

export function taskCostLabel(task: TaskRecord, locale: string): string {
  return task.costUnit === "usd"
    ? formatCurrency(task.cost, locale)
    : formatNumber(task.cost, locale);
}

export function taskDurationSeconds(task: TaskRecord): number | null {
  if (!task.startedAt) return null;
  const active = task.status === "queued" || task.status === "processing";
  if (!active && task.completedAt === null) return null;
  const end = active ? Math.floor(Date.now() / 1000) : task.completedAt;
  if (end === null) return null;
  return Math.max(0, end - task.startedAt);
}

export function formatTaskDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

export type TaskMetadataEntry = {
  label: string;
  value: string;
};

export function taskMetadataEntries(task: TaskRecord, locale: string): TaskMetadataEntry[] {
  const entries: TaskMetadataEntry[] = [];
  if (task.metadata.durationSeconds !== null) {
    entries.push({ label: "Duration", value: formatTaskDuration(task.metadata.durationSeconds) });
  }
  if (task.metadata.resolution) {
    entries.push({ label: "Resolution", value: task.metadata.resolution });
  }
  if (task.metadata.aspectRatio) {
    entries.push({ label: "Aspect ratio", value: task.metadata.aspectRatio });
  }
  if (task.metadata.outputCount !== null) {
    entries.push({
      label: task.type === "audio" ? "Tracks" : "Outputs",
      value: formatNumber(task.metadata.outputCount, locale),
    });
  }
  if (task.metadata.quality) {
    entries.push({ label: "Quality", value: task.metadata.quality });
  }
  if (task.metadata.voice) {
    entries.push({
      label: task.type === "audio" ? "Voice or style" : "Voice",
      value: task.metadata.voice,
    });
  }
  if (task.metadata.format) {
    entries.push({ label: "Format", value: task.metadata.format });
  }
  return entries;
}
