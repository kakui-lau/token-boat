import { describe, expect, test } from "vitest";

import { readLegalContent } from "@/islands/legal/legal-content";

describe("public legal document contract", () => {
  test("returns only configured content from a successful envelope", () => {
    expect(readLegalContent({ data: "  # Terms  ", success: true })).toBe("# Terms");
  });

  test("fails closed for missing, unsuccessful, or non-text content", () => {
    expect(readLegalContent({ data: "Terms", success: false })).toBe("");
    expect(readLegalContent({ data: { html: "Terms" }, success: true })).toBe("");
    expect(readLegalContent(null)).toBe("");
  });
});
