import { describe, expect, test } from "vitest";

import { formatUsd } from "../admin-task-format";

describe("administrator task USD formatting", () => {
  test("shows an em dash when historical USD is unavailable", () => {
    expect(formatUsd(null, "en-US")).toBe("—");
  });

  test("formats an available historical USD amount", () => {
    expect(formatUsd(0.125, "en-US")).toBe("$0.125");
  });
});
