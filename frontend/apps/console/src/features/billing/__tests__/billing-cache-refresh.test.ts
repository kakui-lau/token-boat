import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test, vi } from "vitest";

import { invalidateBillingQueries } from "../lib/invalidate-billing-queries";

describe("billing cache refresh", () => {
  test("refreshes every customer-visible balance and payment surface", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    await invalidateBillingQueries(queryClient);

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["billing"],
      ["billing-ledger"],
      ["billing-transactions"],
      ["onboarding"],
      ["overview"],
    ]);
  });
});
