export type PublicMonitorStatus = {
  group: string | null;
  name: string;
  status: number;
  uptime: number | null;
};

export type PublicStatusGroup = {
  name: string;
  monitors: PublicMonitorStatus[];
};

export function parsePublicStatusEnvelope(value: unknown): PublicStatusGroup[] {
  const envelope = asRecord(value);
  if (envelope.success !== true) return [];

  return asArray(envelope.data)
    .map(asRecord)
    .map((group) => ({
      name: readString(group.categoryName) ?? "Service",
      monitors: asArray(group.monitors)
        .map(asRecord)
        .map((monitor) => ({
          group: readString(monitor.group),
          name: readString(monitor.name),
          status: readNumber(monitor.status),
          uptime: readNumber(monitor.uptime),
        }))
        .filter(
          (monitor): monitor is PublicMonitorStatus =>
            monitor.name !== null && monitor.status !== null,
        )
        .map((monitor) => ({
          ...monitor,
          uptime:
            monitor.uptime !== null && monitor.uptime >= 0 && monitor.uptime <= 1
              ? monitor.uptime
              : null,
        })),
    }))
    .filter((group) => group.monitors.length > 0);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
