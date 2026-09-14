import { describe, expect, test } from "vitest";

import { modelPath, publicModelIds } from "@/content/model-routes";

describe("public model routes", () => {
  test("contains the latest models from the anonymous pricing catalog", () => {
    expect(publicModelIds).toEqual(
      expect.arrayContaining([
        "moonshotai/kimi-k2.6-premium",
        "moonshotai/kimi-k2.7-code-highspeed-premium",
        "moonshotai/kimi-k2.7-code-premium",
        "moonshotai/kimi-k3-premium",
      ]),
    );
  });

  test("stays sorted, unique, and preserves provider-qualified model paths", () => {
    expect(publicModelIds).toEqual([...new Set(publicModelIds)].sort());
    expect(modelPath("en", "moonshotai/kimi-k2.7-code-premium")).toBe(
      "/en/models/moonshotai/kimi-k2.7-code-premium",
    );
  });
});
