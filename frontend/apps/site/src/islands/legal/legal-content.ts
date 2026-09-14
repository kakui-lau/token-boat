export function readLegalContent(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "";
  const envelope = value as Record<string, unknown>;
  return envelope.success === true && typeof envelope.data === "string" ? envelope.data.trim() : "";
}

export function demoteLegalMarkdownHeadings(value: string): string {
  return value.replace(/^(#{1,5})([ \t]+)/gm, "$1#$2");
}

export function demoteLegalHtmlHeadings(value: string): string {
  return value.replace(
    /<(\/?)h([1-5])(\b[^>]*)>/gi,
    (_, closing: string, level: string, attributes: string) =>
      `<${closing}h${Number(level) + 1}${attributes}>`,
  );
}
