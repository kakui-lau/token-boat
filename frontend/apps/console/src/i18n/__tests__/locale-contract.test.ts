import { describe, expect, it } from "vitest";

import en from "../locales/en.json";
import zh from "../locales/zh.json";

describe("User Console locale contract", () => {
  it("keeps Simplified Chinese keys aligned with English", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });
});
