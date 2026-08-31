import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RechargePage } from "@/features/recharge/pages/recharge-page";

const rechargeSearchSchema = z.object({
  payment: z.enum(["cancelled", "pending", "success"]).optional(),
});

export const Route = createFileRoute("/recharge")({
  component: RechargeRoute,
  validateSearch: rechargeSearchSchema,
});

function RechargeRoute() {
  const { payment } = Route.useSearch();
  return <RechargePage paymentStatus={payment} />;
}
