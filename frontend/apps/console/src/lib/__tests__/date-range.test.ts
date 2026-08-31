import { describe, expect, it } from "vitest";

import {
  createCustomDateRange,
  createDateRange,
  dateRangeDayCount,
  timestampMatchesDateRange,
} from "../date-range";

describe("date range contract", () => {
  it("creates inclusive quick ranges ending on the reference day", () => {
    const range = createDateRange("7d", new Date(2026, 7, 28, 12));

    expect(range).toEqual({ preset: "7d", from: "2026-08-22", to: "2026-08-28" });
    expect(dateRangeDayCount(range)).toBe(7);
  });

  it("creates the previous calendar day and extended quick ranges", () => {
    const referenceDate = new Date(2026, 7, 28, 12);

    expect(createDateRange("yesterday", referenceDate)).toEqual({
      preset: "yesterday",
      from: "2026-08-27",
      to: "2026-08-27",
    });
    expect(dateRangeDayCount(createDateRange("14d", referenceDate))).toBe(14);
    expect(dateRangeDayCount(createDateRange("180d", referenceDate))).toBe(180);
    expect(dateRangeDayCount(createDateRange("365d", referenceDate))).toBe(365);
  });

  it("rejects incomplete and reversed custom ranges", () => {
    expect(createCustomDateRange("", "2026-08-28")).toBeNull();
    expect(createCustomDateRange("2026-08-29", "2026-08-28")).toBeNull();
  });

  it("matches timestamps throughout the final selected day", () => {
    const range = { preset: "custom", from: "2026-08-27", to: "2026-08-28" } as const;
    const lateOnFinalDay = Math.floor(new Date("2026-08-28T23:30:00").getTime() / 1000);

    expect(timestampMatchesDateRange(lateOnFinalDay, range)).toBe(true);
  });
});
