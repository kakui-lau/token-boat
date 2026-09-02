import { describe, expect, test } from "vitest";

import { getPlaygroundModelModes } from "../playground-model-capabilities";

describe("Playground model capabilities", () => {
  test("derives modes from backend endpoint metadata", () => {
    expect(
      getPlaygroundModelModes({
        id: "multimodal",
        label: "multimodal",
        group: "default",
        supportedEndpointTypes: ["openai", "image-generation", "openai-video"],
      }),
    ).toEqual(["chat", "image", "video"]);
  });

  test("keeps older model responses compatible with chat", () => {
    expect(getPlaygroundModelModes({ id: "legacy", label: "legacy", group: "default" })).toEqual([
      "chat",
    ]);
  });
});
