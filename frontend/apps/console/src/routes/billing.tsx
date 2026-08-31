import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/pages/billing-page";
import { parseBillingSearch } from "@/lib/list-search";

export const Route = createFileRoute("/billing")({
  validateSearch: parseBillingSearch,
  component: BillingRoute,
});

function BillingRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <BillingPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
