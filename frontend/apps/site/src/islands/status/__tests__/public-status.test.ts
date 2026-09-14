import { describe, expect, test } from "vitest";

import {
  isSuccessfulPublicStatusEnvelope,
  parsePublicStatusEnvelope,
  publicRequestLogsPath,
} from "@/islands/status/public-status";

describe("public status contract", () => {
  test("keeps only named monitors with bounded uptime values", () => {
    expect(
      parsePublicStatusEnvelope({
        data: [
          {
            categoryName: "Core API",
            monitors: [
              { group: "Gateway", name: "API", status: 1, uptime: 0.9997 },
              { name: "Out of range", status: 0, uptime: 10 },
              { name: "Missing status" },
            ],
          },
        ],
        success: true,
      }),
    ).toEqual([
      {
        monitors: [
          { group: "Gateway", name: "API", status: 1, uptime: 0.9997 },
          { group: null, name: "Out of range", status: 0, uptime: null },
        ],
        name: "Core API",
      },
    ]);
  });

  test("fails closed for unsuccessful or malformed payloads", () => {
    expect(parsePublicStatusEnvelope({ data: [{ monitors: [] }], success: false })).toEqual([]);
    expect(parsePublicStatusEnvelope(null)).toEqual([]);
    expect(isSuccessfulPublicStatusEnvelope({ data: [], success: true })).toBe(true);
    expect(isSuccessfulPublicStatusEnvelope({ data: null, success: true })).toBe(false);
    expect(isSuccessfulPublicStatusEnvelope({ data: [], success: false })).toBe(false);
  });

  test("sends account-level diagnosis to the existing request logs route", () => {
    expect(publicRequestLogsPath).toBe("/console/logs");
  });
});
