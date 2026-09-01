import { createFileRoute } from "@tanstack/react-router";

import { AccountActivityPage } from "@/features/account-activity/pages/account-activity-page";
import { parseAccountActivitySearch, searchPatchShouldResetScroll } from "@/lib/list-search";

export const Route = createFileRoute("/activity")({
  validateSearch: parseAccountActivitySearch,
  component: AccountActivityRoute,
});

function AccountActivityRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <AccountActivityPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({
          resetScroll: searchPatchShouldResetScroll(patch, ["detail"]),
          search: (previous) => ({ ...previous, ...patch }),
        })
      }
    />
  );
}
