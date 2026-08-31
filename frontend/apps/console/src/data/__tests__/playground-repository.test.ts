import { afterEach, describe, expect, test, vi } from "vitest";

import { liveRepository } from "../live-repository";

afterEach(() => vi.unstubAllGlobals());

describe("live Playground repository", () => {
  test("sends the selected key group and the complete conversation to the Playground endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-1",
          model: "gpt-5",
          choices: [{ message: { content: "Answer" } }],
          usage: { prompt_tokens: 24, completion_tokens: 12 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await liveRepository.sendPlaygroundMessage({
      apiKeyId: 7,
      apiKeyName: "Development key",
      group: "priority",
      model: "gpt-5",
      systemPrompt: "Be concise.",
      messages: [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Follow-up" },
      ],
      temperature: 0.4,
      maxTokens: 2048,
    });

    const [path, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/pg/chat/completions");
    expect(JSON.parse(String(options.body))).toEqual({
      api_key_id: 7,
      model: "gpt-5",
      group: "priority",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Follow-up" },
      ],
      temperature: 0.4,
      max_tokens: 2048,
      stream: false,
    });
  });

  test("loads models for the selected API key group", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: ["gpt-5"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(liveRepository.listPlaygroundModels("priority group")).resolves.toEqual([
      { id: "gpt-5", label: "gpt-5", group: "priority group" },
    ]);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/user/models?group=priority%20group");
  });
});
