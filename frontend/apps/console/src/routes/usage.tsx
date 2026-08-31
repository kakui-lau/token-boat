import { createFileRoute } from "@tanstack/react-router";
import { UsagePage } from "@/features/usage/pages/usage-page";
import { parseUsageSearch } from "@/lib/list-search";

export const Route = createFileRoute("/usage")({
  validateSearch: parseUsageSearch,
  component: UsageRoute,
});

function UsageRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <UsagePage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
