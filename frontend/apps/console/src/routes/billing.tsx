import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/pages/billing-page";
import { parseBillingSearch, searchPatchShouldResetScroll } from "@/lib/list-search";

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
        void navigate({
          resetScroll: searchPatchShouldResetScroll(patch, ["detail", "ledgerDetail"]),
          search: (previous) => ({ ...previous, ...patch }),
        })
      }
    />
  );
}
