import { afterEach, describe, expect, test, vi } from "vitest";

import { liveRepository } from "../live-repository";

afterEach(() => vi.unstubAllGlobals());

describe("live Playground repository", () => {
  test("sends the current user group without an API key and includes the complete conversation", async () => {
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

  test("loads models for the current user group", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [{ id: "gpt-5", supported_endpoint_types: ["openai", "image-generation"] }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(liveRepository.listPlaygroundModels("priority group")).resolves.toEqual([
      {
        id: "gpt-5",
        label: "gpt-5",
        group: "priority group",
        supportedEndpointTypes: ["openai", "image-generation"],
      },
    ]);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/user/models?group=priority%20group&details=true",
    );
  });

  test("generates images through the authenticated Playground endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          created: 123,
          data: [
            { url: "https://cdn.example/image.png", revised_prompt: "A precise prompt" },
            { b64_json: "aW1hZ2U=" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      liveRepository.generatePlaygroundImages({
        group: "priority",
        model: "gpt-image-2",
        prompt: "Draw a launch-ready dashboard",
        size: "1024x1024",
        quality: "high",
        count: 2,
      }),
    ).resolves.toEqual({
      createdAt: 123,
      images: [
        {
          url: "https://cdn.example/image.png",
          revisedPrompt: "A precise prompt",
          transient: false,
        },
        { url: "data:image/png;base64,aW1hZ2U=", revisedPrompt: null, transient: true },
      ],
    });

    const [path, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/pg/images/generations");
    expect(JSON.parse(String(options.body))).toEqual({
      group: "priority",
      model: "gpt-image-2",
      prompt: "Draw a launch-ready dashboard",
      size: "1024x1024",
      quality: "high",
      n: 2,
    });
  });

  test("rejects unsafe media URLs returned by an upstream provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ created: 123, data: [{ url: "javascript:alert(1)" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      liveRepository.generatePlaygroundImages({
        group: "priority",
        model: "image-model",
        prompt: "Safe output",
        size: "1024x1024",
        quality: "auto",
        count: 1,
      }),
    ).rejects.toThrow("playground.images.data[0].url");
  });

  test("submits and fetches video tasks through Playground endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "task-1", polling_url: "/v1/videos/task-1", status: "pending" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "task-1",
            polling_url: "/v1/videos/task-1",
            status: "completed",
            unsigned_urls: ["https://cdn.example/video.mp4"],
            usage: { cost: 0.4 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      liveRepository.createPlaygroundVideo({
        group: "priority",
        model: "video-model",
        prompt: "A cinematic ocean scene",
        duration: 10,
        resolution: "720p",
        aspectRatio: "16:9",
        generateAudio: true,
      }),
    ).resolves.toMatchObject({ id: "task-1", status: "pending" });
    await expect(liveRepository.getPlaygroundVideo("task-1")).resolves.toEqual({
      id: "task-1",
      pollingUrl: "/v1/videos/task-1",
      status: "completed",
      unsignedUrls: ["https://cdn.example/video.mp4"],
      error: null,
      estimatedCost: 0.4,
    });

    const [createPath, createOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createPath).toBe("/pg/videos");
    expect(JSON.parse(String(createOptions.body))).toEqual({
      group: "priority",
      model: "video-model",
      prompt: "A cinematic ocean scene",
      duration: 10,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/pg/videos/task-1");
  });
});
