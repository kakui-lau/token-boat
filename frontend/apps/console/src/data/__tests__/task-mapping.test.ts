import { describe, expect, test } from "vitest";

import { mapLiveTaskRecord } from "../live-repository";
import { taskDurationSeconds } from "@/features/tasks/lib/task-display";

describe("live task mapping", () => {
  test("classifies Suno tasks as audio and preserves type-specific metadata", () => {
    const task = mapLiveTaskRecord({
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
    });

    expect(task).toMatchObject({
      type: "audio",
      model: "suno-v4.5",
      prompt: "Warm electronic brand theme",
      status: "succeeded",
      resultUrl: "https://example.com/song.mp3",
      cost: 60_000,
      costUnit: "quota",
      metadata: {
        durationSeconds: 30,
        voice: "instrumental",
        format: "mp3",
      },
    });
  });

  test("keeps cancelled status and failure context instead of treating it as queued", () => {
    const task = mapLiveTaskRecord({
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
    });

    expect(task.type).toBe("video");
    expect(task.status).toBe("cancelled");
    expect(task.progress).toBe(46);
    expect(task.failureReason).toBe("Cancelled by upstream");
    expect(task.metadata.aspectRatio).toBe("16:9");
  });

  test("keeps an unrecognized task type, status, and progress explicit", () => {
    const task = mapLiveTaskRecord({
      task_id: "custom-1",
      platform: "custom-provider",
      action: "execute",
      status: "CUSTOM_STATE",
      submit_time: 1_700_000_000,
      quota: 0,
      properties: { origin_model_name: "custom-model" },
    });

    expect(task).toMatchObject({ type: "unknown", status: "unknown", progress: null });
    expect(task.metadata.durationSeconds).toBeNull();
    expect(task.metadata.outputCount).toBeNull();
  });

  test("does not invent model, platform, or action values when the API omits them", () => {
    const task = mapLiveTaskRecord({
      task_id: "legacy-1",
      status: "SUCCESS",
      submit_time: 1_700_000_000,
      quota: 0,
      properties: {},
    });

    expect(task).toMatchObject({
      action: null,
      model: null,
      platform: null,
      type: "unknown",
    });
  });

  test("does not keep increasing a terminal task duration when completion time is absent", () => {
    const task = mapLiveTaskRecord({
      task_id: "terminal-without-finish-time",
      platform: "suno",
      action: "MUSIC",
      status: "FAILURE",
      submit_time: 1_700_000_000,
      start_time: 1_700_000_010,
      quota: 0,
      properties: { origin_model_name: "suno-v4" },
    });

    expect(taskDurationSeconds(task)).toBeNull();
  });
});
