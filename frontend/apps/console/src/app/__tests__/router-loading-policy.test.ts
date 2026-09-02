import { describe, expect, it } from "vitest";

import { router } from "../router";

describe("Console router loading policy", () => {
  it("preloads route code only after the user expresses navigation intent", () => {
    expect(router.options.defaultPreload).toBe("intent");
  });
});
