import { createFileRoute } from "@tanstack/react-router";

import { RequestLogsPage } from "@/features/request-logs/pages/request-logs-page";
import { parseRequestLogSearch } from "@/lib/list-search";

export const Route = createFileRoute("/logs")({
  validateSearch: parseRequestLogSearch,
  component: RequestLogsRoute,
});

function RequestLogsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <RequestLogsPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
