import { describe, expect, test } from "vitest";

import {
  adminZonedDateTimeCandidates,
  changeAdminTimeRangeTimeZone,
  createCustomAdminTimeRange,
  createDefaultAdminTimeRange,
  createRecentAdminTimeRange,
  formatAdminTimeZoneOffset,
  formatAdminTimeZoneRangeOffset,
  formatAdminZonedDateTimeParts,
  parseAdminZonedDateTime,
  refreshAdminTimeRange,
} from "../admin-time-range";

describe("admin time ranges", () => {
  test("creates the default rolling hour at exact second boundaries", () => {
    const referenceDate = new Date("2026-09-08T04:32:15.987Z");

    expect(createDefaultAdminTimeRange("UTC", referenceDate)).toEqual({
      endTimestamp: Date.UTC(2026, 8, 8, 4, 32, 15) / 1_000,
      preset: "1h",
      startTimestamp: Date.UTC(2026, 8, 8, 3, 32, 15) / 1_000,
      timeZone: "UTC",
    });
  });

  test.each([
    ["5m", 5 * 60],
    ["15m", 15 * 60],
    ["30m", 30 * 60],
    ["1h", 60 * 60],
    ["3h", 3 * 60 * 60],
    ["6h", 6 * 60 * 60],
    ["24h", 24 * 60 * 60],
    ["3d", 3 * 24 * 60 * 60],
    ["7d", 7 * 24 * 60 * 60],
  ] as const)("creates an exact %s rolling range", (preset, seconds) => {
    const range = createRecentAdminTimeRange(
      preset,
      "Asia/Shanghai",
      new Date("2026-09-08T04:32:15Z"),
    );

    expect(range.endTimestamp - range.startTimestamp).toBe(seconds);
    expect(range).toMatchObject({ preset, timeZone: "Asia/Shanghai" });
  });

  test("parses wall-clock values to the second in the selected zone", () => {
    expect(
      createCustomAdminTimeRange(
        "2026-09-08",
        "12:34:56",
        "2026-09-08",
        "13:45:07",
        "Asia/Shanghai",
      ),
    ).toEqual({
      endTimestamp: Date.UTC(2026, 8, 8, 5, 45, 7) / 1_000,
      preset: "custom",
      startTimestamp: Date.UTC(2026, 8, 8, 4, 34, 56) / 1_000,
      timeZone: "Asia/Shanghai",
    });
  });

  test("rejects custom ranges longer than 31 days", () => {
    expect(
      createCustomAdminTimeRange("2026-09-01", "00:00:00", "2026-10-03", "00:00:00", "UTC"),
    ).toBeNull();
  });

  test("switching zones preserves the selected instants", () => {
    const original = createRecentAdminTimeRange("1h", "UTC", new Date("2026-09-08T04:00:00Z"));
    const switched = changeAdminTimeRangeTimeZone(original, "Asia/Tokyo");

    expect(switched.startTimestamp).toBe(original.startTimestamp);
    expect(switched.endTimestamp).toBe(original.endTimestamp);
    expect(formatAdminZonedDateTimeParts(switched.startTimestamp, switched.timeZone)).toEqual({
      date: "2026-09-08",
      time: "12:00:00",
    });
  });

  test("refreshes rolling presets while leaving custom instants fixed", () => {
    const rolling = createRecentAdminTimeRange("5m", "UTC", new Date("2026-09-08T04:00:00Z"));
    const refreshed = refreshAdminTimeRange(rolling, new Date("2026-09-08T05:00:00Z"));
    expect(refreshed.endTimestamp).toBe(Date.UTC(2026, 8, 8, 5) / 1_000);
    expect(refreshed.endTimestamp - refreshed.startTimestamp).toBe(5 * 60);

    const custom = { ...rolling, preset: "custom" as const };
    expect(refreshAdminTimeRange(custom, new Date("2026-09-08T06:00:00Z"))).toBe(custom);
  });

  test("rejects nonexistent wall-clock times during a daylight-saving transition", () => {
    expect(parseAdminZonedDateTime("2026-03-08", "02:30:00", "America/New_York")).toBeUndefined();
  });

  test("exposes both instants for a repeated daylight-saving wall-clock time", () => {
    const candidates = adminZonedDateTimeCandidates("2026-11-01", "01:30:00", "America/New_York");

    expect(candidates).toEqual([
      Date.UTC(2026, 10, 1, 5, 30) / 1_000,
      Date.UTC(2026, 10, 1, 6, 30) / 1_000,
    ]);
    expect(parseAdminZonedDateTime("2026-11-01", "01:30:00", "America/New_York", "later")).toBe(
      candidates[1],
    );
  });

  test("reports daylight-aware offsets for fixed zones", () => {
    const summer = Date.UTC(2026, 6, 1, 12) / 1_000;
    const winter = Date.UTC(2026, 0, 1, 12) / 1_000;

    expect(formatAdminTimeZoneOffset(summer, "Asia/Shanghai")).toBe("UTC+08:00");
    expect(formatAdminTimeZoneOffset(summer, "America/New_York")).toBe("UTC-04:00");
    expect(formatAdminTimeZoneOffset(winter, "America/New_York")).toBe("UTC-05:00");
  });

  test("shows both offsets when a range crosses a daylight-saving transition", () => {
    expect(
      formatAdminTimeZoneRangeOffset(
        Date.UTC(2026, 10, 1, 5, 30) / 1_000,
        Date.UTC(2026, 10, 1, 7, 30) / 1_000,
        "America/New_York",
      ),
    ).toBe("UTC-04:00 → UTC-05:00");
  });
});
