import type { QueryClient } from "@tanstack/react-query";

export function invalidateBillingQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["billing"] }),
    queryClient.invalidateQueries({ queryKey: ["billing-ledger"] }),
    queryClient.invalidateQueries({ queryKey: ["billing-transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
    queryClient.invalidateQueries({ queryKey: ["overview"] }),
  ]);
}
