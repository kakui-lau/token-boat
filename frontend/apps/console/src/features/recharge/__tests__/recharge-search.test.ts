import { describe, expect, test } from "vitest";

import { parseRechargeSearch } from "../lib/recharge-search";

describe("recharge route search", () => {
  test.each(["cancelled", "pending", "success"] as const)(
    "accepts the supported %s payment result",
    (payment) => {
      expect(parseRechargeSearch({ payment, ignored: "value" })).toEqual({ payment });
    },
  );

  test("keeps an absent payment result optional", () => {
    expect(parseRechargeSearch({ ignored: "value" })).toEqual({});
  });

  test.each(["failed", "", null, 1, ["success"]])(
    "rejects the unsupported payment result %j",
    (payment) => {
      expect(() => parseRechargeSearch({ payment })).toThrow("Invalid recharge payment status.");
    },
  );
});
