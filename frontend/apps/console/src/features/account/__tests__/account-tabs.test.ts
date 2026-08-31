import { describe, expect, test } from "vitest";

import { accountSearchSchema } from "../lib/account-tabs";

describe("account tab search state", () => {
  test("preserves direct links to theme settings", () => {
    expect(accountSearchSchema.parse({ tab: "theme" })).toEqual({ tab: "theme" });
  });

  test("falls back to profile for unknown account tabs", () => {
    expect(accountSearchSchema.parse({ tab: "removed-tab" })).toEqual({ tab: "profile" });
  });
});
