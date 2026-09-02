import type {
  CreatePlaygroundConversationInput,
  PlaygroundConversation,
  PlaygroundStoredMessage,
} from "@/data/contracts";

const storageVersion = 2;
const storagePrefix = "token-boat:playground-history:v1:user:";

type PlaygroundStorageEnvelope = {
  version: typeof storageVersion;
  conversations: PlaygroundConversation[];
};

export class PlaygroundLocalStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PlaygroundLocalStorageError";
  }
}

export function getPlaygroundStorageKey(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new PlaygroundLocalStorageError("A valid user is required for local history.");
  }
  return `${storagePrefix}${userId}`;
}

export function listLocalPlaygroundConversations(userId: number): PlaygroundConversation[] {
  if (typeof window === "undefined") return [];

  try {
    const serialized = window.localStorage.getItem(getPlaygroundStorageKey(userId));
    if (!serialized) return [];
    const value: unknown = JSON.parse(serialized);
    const envelope = readPlaygroundStorageEnvelope(value);
    if (!envelope) {
      throw new PlaygroundLocalStorageError("The local Playground history is invalid.");
    }
    if ((value as { version?: unknown }).version !== storageVersion) {
      writeLocalPlaygroundConversations(userId, envelope.conversations);
    }
    return [...envelope.conversations].sort(
      (left, right) => right.updatedAt - left.updatedAt || right.id.localeCompare(left.id),
    );
  } catch (error) {
    if (error instanceof PlaygroundLocalStorageError) throw error;
    throw new PlaygroundLocalStorageError("Unable to read local Playground history.", {
      cause: error,
    });
  }
}

export function createLocalPlaygroundConversation(
  userId: number,
  input: CreatePlaygroundConversationInput,
): PlaygroundConversation[] {
  if (!input.model.trim()) {
    throw new PlaygroundLocalStorageError("The Playground configuration is invalid.");
  }
  const createdAt = Math.floor(Date.now() / 1000);
  const conversation: PlaygroundConversation = {
    id: crypto.randomUUID().replaceAll("-", ""),
    title: "",
    model: input.model.trim(),
    messages: [],
    createdAt,
    updatedAt: createdAt,
  };
  const conversations = [
    conversation,
    ...listLocalPlaygroundConversations(userId).filter((item) => item.id !== conversation.id),
  ];
  writeLocalPlaygroundConversations(userId, conversations);
  return conversations;
}

export function saveLocalPlaygroundConversation(
  userId: number,
  threadId: string,
  configuration: CreatePlaygroundConversationInput,
  messages: PlaygroundStoredMessage[],
): PlaygroundConversation[] {
  const conversations = listLocalPlaygroundConversations(userId);
  const existing = conversations.find((item) => item.id === threadId);
  if (!existing) {
    throw new PlaygroundLocalStorageError("The local Playground conversation was not found.");
  }
  if (!configuration.model.trim() || !messages.every(isPlaygroundStoredMessage)) {
    throw new PlaygroundLocalStorageError("The Playground conversation is invalid.");
  }

  const firstPrompt = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  const updated: PlaygroundConversation = {
    ...existing,
    title: existing.title || createConversationTitle(firstPrompt?.content ?? ""),
    model: configuration.model.trim(),
    messages: messages.map((message) => ({
      ...message,
      ...(message.metrics ? { metrics: { ...message.metrics } } : {}),
    })),
    updatedAt: Math.floor(Date.now() / 1000),
  };
  const next = [updated, ...conversations.filter((item) => item.id !== threadId)];
  writeLocalPlaygroundConversations(userId, next);
  return next;
}

export function deleteLocalPlaygroundConversation(
  userId: number,
  threadId: string,
): PlaygroundConversation[] {
  const conversations = listLocalPlaygroundConversations(userId).filter(
    (item) => item.id !== threadId,
  );
  writeLocalPlaygroundConversations(userId, conversations);
  return conversations;
}

function writeLocalPlaygroundConversations(
  userId: number,
  conversations: PlaygroundConversation[],
) {
  if (typeof window === "undefined") return;
  const envelope: PlaygroundStorageEnvelope = { version: storageVersion, conversations };
  try {
    window.localStorage.setItem(getPlaygroundStorageKey(userId), JSON.stringify(envelope));
  } catch (error) {
    throw new PlaygroundLocalStorageError("Unable to save local Playground history.", {
      cause: error,
    });
  }
}

function readPlaygroundStorageEnvelope(value: unknown): PlaygroundStorageEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  if (
    (envelope.version !== 1 && envelope.version !== storageVersion) ||
    !Array.isArray(envelope.conversations)
  ) {
    return null;
  }
  const conversations = envelope.conversations.map(readPlaygroundConversation);
  if (conversations.some((conversation) => conversation === null)) return null;
  return {
    version: storageVersion,
    conversations: conversations as PlaygroundConversation[],
  };
}

function readPlaygroundConversation(value: unknown): PlaygroundConversation | null {
  if (!value || typeof value !== "object") return null;
  const conversation = value as Record<string, unknown>;
  if (
    typeof conversation.id !== "string" ||
    conversation.id.length === 0 ||
    typeof conversation.title !== "string" ||
    typeof conversation.model !== "string" ||
    conversation.model.length === 0 ||
    !Array.isArray(conversation.messages) ||
    !conversation.messages.every(isPlaygroundStoredMessage) ||
    typeof conversation.createdAt !== "number" ||
    !Number.isFinite(conversation.createdAt) ||
    typeof conversation.updatedAt !== "number" ||
    !Number.isFinite(conversation.updatedAt)
  ) {
    return null;
  }
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    messages: conversation.messages,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function isPlaygroundStoredMessage(value: unknown): value is PlaygroundStoredMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    message.id.length > 0 &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    (message.metrics === undefined ||
      (message.role === "assistant" && isPlaygroundMessageMetrics(message.metrics)))
  );
}

function isPlaygroundMessageMetrics(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const metrics = value as Record<string, unknown>;
  return (
    typeof metrics.model === "string" &&
    metrics.model.length > 0 &&
    isOptionalTokenCount(metrics.inputTokens) &&
    isOptionalTokenCount(metrics.outputTokens) &&
    typeof metrics.latencyMs === "number" &&
    Number.isFinite(metrics.latencyMs) &&
    metrics.latencyMs >= 0
  );
}

function isOptionalTokenCount(value: unknown): boolean {
  return value === undefined || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function createConversationTitle(content: string): string {
  const normalized = content.trim().replace(/\s+/g, " ");
  const characters = Array.from(normalized);
  return characters.length > 80 ? `${characters.slice(0, 80).join("")}…` : normalized;
}
