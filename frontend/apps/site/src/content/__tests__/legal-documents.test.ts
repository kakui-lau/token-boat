import { describe, expect, test } from "vitest";

import { legalDocuments } from "@/content/legal-documents";
import { siteLocales } from "@/content/site-copy";

describe("published legal document snapshots", () => {
  test.each(siteLocales)("provides complete %s terms and privacy content", (locale) => {
    const documents = legalDocuments[locale];

    expect(documents.terms).toContain("support@quantumnous.com");
    expect(documents.privacy).toContain("support@quantumnous.com");
    expect(documents.terms.match(/^## /gm)).toHaveLength(11);
    expect(documents.privacy.match(/^## /gm)).toHaveLength(12);
  });

  test("does not expose launch placeholders in a published legal snapshot", () => {
    const content = Object.values(legalDocuments)
      .flatMap((documents) => [documents.terms, documents.privacy])
      .join("\n");

    expect(content).not.toMatch(
      /public-site draft|publication note|once configured|草稿|待配置|等待正式|尚未配置/i,
    );
  });
});
