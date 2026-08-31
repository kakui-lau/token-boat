import { createFileRoute } from "@tanstack/react-router";

import { ModelsPage } from "@/features/models/pages/models-page";
import { parseModelSearch } from "@/lib/list-search";

export const Route = createFileRoute("/models")({
  validateSearch: parseModelSearch,
  component: ModelsRoute,
});

function ModelsRoute() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <ModelsPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
