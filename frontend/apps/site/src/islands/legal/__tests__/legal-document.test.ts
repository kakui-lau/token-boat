import { describe, expect, test } from "vitest";

import {
  demoteLegalHtmlHeadings,
  demoteLegalMarkdownHeadings,
  readLegalContent,
} from "@/islands/legal/legal-content";

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

describe("legal document heading hierarchy", () => {
  test("keeps the page hero as the only h1 when rendering markdown", () => {
    expect(demoteLegalMarkdownHeadings("# Policy\n\n## Scope\n\n###### Detail")).toBe(
      "## Policy\n\n### Scope\n\n###### Detail",
    );
  });

  test("demotes sanitized HTML headings without changing attributes", () => {
    expect(
      demoteLegalHtmlHeadings('<h1 id="policy">Policy</h1><h2>Scope</h2><h6>Detail</h6>'),
    ).toBe('<h2 id="policy">Policy</h2><h3>Scope</h3><h6>Detail</h6>');
  });
});
