import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "@/features/overview/pages/overview-page";
import { parseOverviewSearch } from "@/lib/list-search";

export const Route = createFileRoute("/")({
  validateSearch: parseOverviewSearch,
  component: OverviewRoute,
});

function OverviewRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  return (
    <OverviewPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
