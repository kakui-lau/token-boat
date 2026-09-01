import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  createLocalPlaygroundConversation,
  deleteLocalPlaygroundConversation,
  getPlaygroundStorageKey,
  listLocalPlaygroundConversations,
  PlaygroundLocalStorageError,
  saveLocalPlaygroundConversation,
} from "../playground-local-storage";

describe("Playground local history", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("stores conversations and messages only in a versioned per-user browser key", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    const created = createLocalPlaygroundConversation(12, {
      apiKeyId: 41,
      group: "priority",
      model: "gpt-5",
    });
    const threadId = created[0]!.id;
    const saved = saveLocalPlaygroundConversation(
      12,
      threadId,
      { apiKeyId: 41, group: "priority", model: "gpt-5" },
      [
        { id: "user-1", role: "user", content: "Explain browser-local persistence" },
        {
          id: "assistant-1",
          role: "assistant",
          content: "It stays on this device.",
          metrics: {
            model: "gpt-5",
            inputTokens: 14,
            outputTokens: 230,
            latencyMs: 10_741,
          },
        },
      ],
    );

    expect(saved[0]).toMatchObject({
      id: threadId,
      title: "Explain browser-local persistence",
      messages: [
        { id: "user-1", role: "user", content: "Explain browser-local persistence" },
        {
          id: "assistant-1",
          role: "assistant",
          content: "It stays on this device.",
          metrics: {
            model: "gpt-5",
            inputTokens: 14,
            outputTokens: 230,
            latencyMs: 10_741,
          },
        },
      ],
    });
    expect(window.localStorage.getItem(getPlaygroundStorageKey(12))).toContain('"version":1');
    expect(listLocalPlaygroundConversations(13)).toEqual([]);
  });

  test("deletes the local conversation without affecting another user's history", () => {
    const first = createLocalPlaygroundConversation(12, {
      apiKeyId: 41,
      group: "default",
      model: "gpt-5",
    });
    createLocalPlaygroundConversation(13, {
      apiKeyId: 42,
      group: "default",
      model: "gpt-5",
    });

    expect(deleteLocalPlaygroundConversation(12, first[0]!.id)).toEqual([]);
    expect(listLocalPlaygroundConversations(13)).toHaveLength(1);
  });

  test("rejects an incompatible or malformed storage payload instead of inventing history", () => {
    window.localStorage.setItem(
      getPlaygroundStorageKey(12),
      JSON.stringify({ version: 2, conversations: [] }),
    );

    expect(() => listLocalPlaygroundConversations(12)).toThrow(PlaygroundLocalStorageError);
  });
});
