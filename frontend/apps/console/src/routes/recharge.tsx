import { createFileRoute } from "@tanstack/react-router";

import { parseRechargeSearch } from "@/features/recharge/lib/recharge-search";
import { RechargePage } from "@/features/recharge/pages/recharge-page";

export const Route = createFileRoute("/recharge")({
  component: RechargeRoute,
  validateSearch: parseRechargeSearch,
});

function RechargeRoute() {
  const { payment } = Route.useSearch();
  return <RechargePage paymentStatus={payment} />;
}
