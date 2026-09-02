import { describe, expect, it } from "vitest";

import { modelDialogHasMoreContent } from "@/islands/pricing/scroll-state";

describe("model dialog scroll cue", () => {
  it("shows the cue when content continues below the visible area", () => {
    expect(
      modelDialogHasMoreContent({ clientHeight: 600, scrollHeight: 1_200, scrollTop: 0 }),
    ).toBe(true);
  });

  it("hides the cue when the user reaches the end", () => {
    expect(
      modelDialogHasMoreContent({ clientHeight: 600, scrollHeight: 1_200, scrollTop: 600 }),
    ).toBe(false);
  });

  it("does not show the cue when all content already fits", () => {
    expect(modelDialogHasMoreContent({ clientHeight: 600, scrollHeight: 600, scrollTop: 0 })).toBe(
      false,
    );
  });
});
