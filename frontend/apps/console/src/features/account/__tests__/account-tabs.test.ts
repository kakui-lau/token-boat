import { describe, expect, test } from "vitest";

import { parseAccountSearch } from "../lib/account-tabs";

describe("account tab search state", () => {
  test("preserves direct links to theme settings", () => {
    expect(parseAccountSearch({ tab: "theme" })).toEqual({ tab: "theme" });
  });

  test("falls back to profile for unknown account tabs", () => {
    expect(parseAccountSearch({ tab: "removed-tab" })).toEqual({ tab: "profile" });
  });
});
