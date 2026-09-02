export function readLegalContent(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "";
  const envelope = value as Record<string, unknown>;
  return envelope.success === true && typeof envelope.data === "string" ? envelope.data.trim() : "";
}
