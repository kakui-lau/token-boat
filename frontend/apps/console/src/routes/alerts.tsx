import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AlertsPage } from "@/features/alerts/pages/alerts-page";

export const Route = createFileRoute("/alerts")({ component: AlertsRoute });

function AlertsRoute() {
  const navigate = useNavigate();

  return (
    <AlertsPage
      onManageAlerts={() => {
        void navigate({ search: { tab: "preferences" }, to: "/account" });
      }}
    />
  );
}
