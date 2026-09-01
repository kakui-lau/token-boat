import { createFileRoute } from "@tanstack/react-router";

import { ModelsPage } from "@/features/models/pages/models-page";
import { parseModelSearch, searchPatchShouldResetScroll } from "@/lib/list-search";

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
        void navigate({
          resetScroll: searchPatchShouldResetScroll(patch, ["detail"]),
          search: (previous) => ({ ...previous, ...patch }),
        })
      }
    />
  );
}
