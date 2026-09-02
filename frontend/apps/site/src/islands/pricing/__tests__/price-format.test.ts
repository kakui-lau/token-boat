import { describe, expect, test } from "vitest";

import { formatCardCurrency } from "@/islands/pricing/price-format";

describe("public card price formatting", () => {
  const compactCases: Array<[number, string]> = [
    [9.95233, "$9.95"],
    [49.76163, "$49.76"],
    [0.99524, "$1.00"],
    [4.97617, "$4.98"],
  ];

  test.each(compactCases)("rounds %s to a compact comparison price", (amount, expected) => {
    expect(formatCardCurrency(amount, "USD", "en")).toBe(expected);
  });

  test("keeps useful precision for very small prices", () => {
    expect(formatCardCurrency(0.00426, "USD", "en")).toBe("$0.0043");
  });

  test("uses the compact currency symbol in Chinese cards", () => {
    expect(formatCardCurrency(9.95233, "USD", "zh")).toBe("$9.95");
  });
});
