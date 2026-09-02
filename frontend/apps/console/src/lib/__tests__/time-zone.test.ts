import { describe, expect, test } from "vitest";

import {
  createRecentZonedDateRange,
  createZonedDateRange,
  formatTimeZoneOffset,
  formatZonedDateTimeParts,
  parseZonedDateTime,
} from "../time-zone";

describe("time-zone helpers", () => {
  test("converts a wall-clock time in an IANA zone to the correct instant", () => {
    const timestamp = parseZonedDateTime("2026-09-02", "12:34:56", "Asia/Shanghai");

    expect(timestamp).toBe(Date.UTC(2026, 8, 2, 4, 34, 56) / 1_000);
    expect(formatZonedDateTimeParts(timestamp, "Asia/Shanghai")).toEqual({
      date: "2026-09-02",
      time: "12:34:56",
    });
    expect(formatTimeZoneOffset(timestamp!, "Asia/Shanghai")).toBe("UTC+08:00");
  });

  test("rejects a local time skipped by a daylight-saving transition", () => {
    expect(parseZonedDateTime("2026-03-08", "02:30:00", "America/New_York")).toBeUndefined();
  });

  test("creates preset boundaries in the selected time zone", () => {
    const range = createZonedDateRange(
      "today",
      "America/New_York",
      new Date("2026-09-03T02:00:00Z"),
    );

    expect(range).toMatchObject({
      from: "2026-09-02",
      preset: "today",
      timeZone: "America/New_York",
      to: "2026-09-02",
    });
    expect(range.startTimestamp).toBe(Date.UTC(2026, 8, 2, 4) / 1_000);
    expect(range.endTimestamp).toBe(Date.UTC(2026, 8, 3, 3, 59, 59) / 1_000);
  });

  test("creates rolling ranges with exact timestamps in the selected time zone", () => {
    const range = createRecentZonedDateRange(
      5 * 60,
      "Asia/Shanghai",
      new Date("2026-09-02T16:02:03Z"),
    );

    expect(range).toEqual({
      preset: "custom",
      from: "2026-09-02",
      to: "2026-09-03",
      startTimestamp: Date.UTC(2026, 8, 2, 15, 57, 3) / 1_000,
      endTimestamp: Date.UTC(2026, 8, 2, 16, 2, 3) / 1_000,
      timeZone: "Asia/Shanghai",
    });
  });
});
