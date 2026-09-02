export type PublicAnnouncement = {
  content: string;
  id: string;
  publishDate: string | null;
  type: string | null;
};

export type PublicFaq = {
  answer: string;
  id: string;
  question: string;
};

export type PublicContent = {
  announcements: PublicAnnouncement[];
  faq: PublicFaq[];
  notice: string | null;
};

export function parsePublicStatus(value: unknown): Pick<PublicContent, "announcements" | "faq"> {
  const envelope = asRecord(value);
  const data = asRecord(envelope.data);
  const faq = data.faq_enabled === false ? [] : asArray(data.faq).map(parseFaq).filter(isPresent);
  const announcements =
    data.announcements_enabled === false
      ? []
      : asArray(data.announcements).map(parseAnnouncement).filter(isPresent);
  return { announcements, faq };
}

export function parsePublicNotice(value: unknown): string | null {
  const data = asRecord(value).data;
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

function parseFaq(value: unknown, index: number): PublicFaq | null {
  const item = asRecord(value);
  const question = readString(item.question);
  const answer = readString(item.answer);
  if (!question || !answer) return null;
  return { answer, id: readId(item.id, `faq-${index}`), question };
}

function parseAnnouncement(value: unknown, index: number): PublicAnnouncement | null {
  const item = asRecord(value);
  const content = readString(item.content);
  if (!content) return null;
  return {
    content,
    id: readId(item.id, `announcement-${index}`),
    publishDate: readString(item.publishDate) ?? readString(item.publish_date),
    type: readString(item.type),
  };
}

function readId(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
