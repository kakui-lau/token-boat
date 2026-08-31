import { describe, expect, test } from "vitest";

import {
  formatCompactDateTime,
  formatCurrency,
  formatIdentifier,
  formatLatency,
  formatPreciseCurrency,
} from "../format";

describe("formatCurrency", () => {
  test("renders every visible currency amount with exactly two decimal places", () => {
    expect(formatCurrency(128.4, "en-US")).toBe("$128.40");
    expect(formatCurrency(-29, "en-US")).toBe("-$29.00");
    expect(formatCurrency(100, "en-US", "JPY")).toBe("¥100.00");
  });

  test("rounds high-precision costs to two decimal places", () => {
    expect(formatCurrency(9.95233, "zh-CN")).toBe("US$9.95");
    expect(formatCurrency(0.06803, "zh-CN")).toBe("US$0.07");
  });
});

describe("formatPreciseCurrency", () => {
  test("retains five decimals for exact-value hints", () => {
    expect(formatPreciseCurrency(9.95233, "zh-CN")).toBe("US$9.95233");
  });
});

describe("formatLatency", () => {
  test("uses compact units without presenting a sub-second request as zero milliseconds", () => {
    expect(formatLatency(null, "en-US")).toBe("—");
    expect(formatLatency(0, "en-US")).toBe("< 1 s");
    expect(formatLatency(812, "en-US")).toBe("812 ms");
    expect(formatLatency(3_000, "en-US")).toBe("3 s");
  });
});

describe("formatCompactDateTime", () => {
  test("keeps table timestamps short while retaining date and minute precision", () => {
    expect(formatCompactDateTime(0, "en-US")).toBe("—");
    expect(formatCompactDateTime(1_787_963_400, "en-US")).toMatch(/08\/29.*\d{2}:\d{2}/);
  });
});

describe("formatIdentifier", () => {
  test("preserves short values and compresses long identifiers", () => {
    expect(formatIdentifier("req_1234")).toBe("req_1234");
    expect(formatIdentifier("req_1234567890abcdef")).toBe("req_1234…cdef");
  });
});
