export class LiveDataContractError extends Error {
  constructor(field: string) {
    super(`The live API response is missing required field: ${field}`);
    this.name = "LiveDataContractError";
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function readString(record: Record<string, unknown>, key: string, fallback = ""): string {
  return typeof record[key] === "string" ? record[key] : fallback;
}

export function readNumber(
  record: Record<string, unknown>,
  key: string,
  fallback = Number.NaN,
): number {
  if (record[key] === null || record[key] === undefined || record[key] === "") return fallback;
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function readOptionalNumber(record: Record<string, unknown>, key: string): number | null {
  if (record[key] === null || record[key] === undefined || record[key] === "") return null;
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : null;
}

export function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | null {
  return typeof record[key] === "boolean" ? record[key] : null;
}

export function requireString(record: Record<string, unknown>, key: string, field = key): string {
  const value = readString(record, key).trim();
  if (!value) throw new LiveDataContractError(field);
  return value;
}

export function requireStringField(
  record: Record<string, unknown>,
  key: string,
  field = key,
): string {
  const value = record[key];
  if (typeof value !== "string") throw new LiveDataContractError(field);
  return value;
}

export function requireNumber(record: Record<string, unknown>, key: string, field = key): number {
  const value = readOptionalNumber(record, key);
  if (value === null) throw new LiveDataContractError(field);
  return value;
}

export function requireBoolean(record: Record<string, unknown>, key: string, field = key): boolean {
  const value = readOptionalBoolean(record, key);
  if (value === null) throw new LiveDataContractError(field);
  return value;
}

export function readUnixTime(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value !== "string" || !value) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

export function readItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  return Array.isArray(record.items) ? record.items : [];
}

export function readOptionalItems(value: unknown, field: string): unknown[] {
  if (value === null || value === undefined) return [];
  return requireItems(value, field);
}

export function requireItems(value: unknown, field: string): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (Array.isArray(record.items)) return record.items;
  throw new LiveDataContractError(field);
}
