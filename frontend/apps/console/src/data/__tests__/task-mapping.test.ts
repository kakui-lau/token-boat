import { describe, expect, test } from "vitest";

import { mapLiveTaskRecord } from "../live-repository";
import { taskDurationSeconds } from "@/features/tasks/lib/task-display";

describe("live task mapping", () => {
  test("classifies Suno tasks as audio and preserves type-specific metadata", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "suno-42",
        platform: "suno",
        action: "MUSIC",
        status: "SUCCESS",
        progress: "100%",
        submit_time: 1_700_000_000,
        start_time: 1_700_000_010,
        finish_time: 1_700_000_100,
        updated_at: 1_700_000_100,
        quota: 60_000,
        result_url: "https://example.com/song.mp3",
        properties: {
          origin_model_name: "suno-v4.5",
          input: JSON.stringify({
            prompt: "Warm electronic brand theme",
            duration: 30,
            format: "mp3",
            voice: "instrumental",
          }),
        },
      },
      500_000,
    );

    expect(task).toMatchObject({
      type: "audio",
      model: "suno-v4.5",
      prompt: "Warm electronic brand theme",
      status: "succeeded",
      resultUrl: "https://example.com/song.mp3",
      cost: 0.12,
      costUnit: "usd",
      metadata: {
        durationSeconds: 30,
        voice: "instrumental",
        format: "mp3",
      },
    });
  });

  test("classifies a Seedance task as video from its model when platform and action are opaque", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "seedance-61",
        platform: "61",
        status: "SUCCESS",
        progress: "100%",
        submit_time: 1_777_000_000,
        quota: 746_585,
        result_url: "https://provider.example/expiring-video.mp4",
        properties: { origin_model_name: "byteplus/seedance-2.0-hc" },
      },
      500_000,
    );

    expect(task.type).toBe("video");
    expect(task.cost).toBe(1.49317);
    expect(task.resultUrl).toBe("/v1/videos/seedance-61/content?index=0");
  });

  test("maps submitted and queued backend states to a visible queued status", () => {
    for (const status of ["NOT_START", "SUBMITTED", "QUEUED"]) {
      const task = mapLiveTaskRecord(
        {
          task_id: `seedance-${status}`,
          platform: "video",
          status,
          progress: "0%",
          submit_time: 1_777_000_000,
          quota: 24_786,
          properties: { origin_model_name: "byteplus/seedance-2.0-fast-hc" },
        },
        500_000,
      );

      expect(task.status).toBe("queued");
    }
  });

  test("keeps cancelled status and failure context instead of treating it as queued", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "video-9",
        platform: "kling",
        action: "video.generate",
        status: "CANCELLED",
        progress: "46%",
        submit_time: 1_700_000_000,
        finish_time: 1_700_000_050,
        quota: 0,
        fail_reason: "Cancelled by upstream",
        properties: {
          origin_model_name: "kling-v2.1",
          input: JSON.stringify({ prompt: "Orbit camera", aspect_ratio: "16:9" }),
        },
      },
      500_000,
    );

    expect(task.type).toBe("video");
    expect(task.status).toBe("cancelled");
    expect(task.progress).toBe(46);
    expect(task.failureReason).toBe("Cancelled by upstream");
    expect(task.metadata.aspectRatio).toBe("16:9");
  });

  test("extracts a readable failure message from a structured task error", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "video-failed-10",
        platform: "61",
        status: "FAILURE",
        submit_time: 1_700_000_000,
        quota: 0,
        fail_reason: JSON.stringify({ code: 400, message: "Video generation failed" }),
        properties: { origin_model_name: "byteplus/seedance-2.0-fast" },
      },
      500_000,
    );

    expect(task.failureReason).toBe("Video generation failed");
  });

  test("keeps an unrecognized task type, status, and progress explicit", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "custom-1",
        platform: "custom-provider",
        action: "execute",
        status: "CUSTOM_STATE",
        submit_time: 1_700_000_000,
        quota: 0,
        properties: { origin_model_name: "custom-model" },
      },
      500_000,
    );

    expect(task).toMatchObject({ type: "unknown", status: "unknown", progress: null });
    expect(task.metadata.durationSeconds).toBeNull();
    expect(task.metadata.outputCount).toBeNull();
  });

  test("does not invent model, platform, or action values when the API omits them", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "legacy-1",
        status: "SUCCESS",
        submit_time: 1_700_000_000,
        quota: 0,
        properties: {},
      },
      500_000,
    );

    expect(task).toMatchObject({
      action: null,
      model: null,
      platform: null,
      type: "unknown",
    });
  });

  test("does not keep increasing a terminal task duration when completion time is absent", () => {
    const task = mapLiveTaskRecord(
      {
        task_id: "terminal-without-finish-time",
        platform: "suno",
        action: "MUSIC",
        status: "FAILURE",
        submit_time: 1_700_000_000,
        start_time: 1_700_000_010,
        quota: 0,
        properties: { origin_model_name: "suno-v4" },
      },
      500_000,
    );

    expect(taskDurationSeconds(task)).toBeNull();
  });
});
