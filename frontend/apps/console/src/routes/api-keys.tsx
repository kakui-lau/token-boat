import { createFileRoute } from "@tanstack/react-router";

import { useSession } from "@/app/session/session-context";
import { ApiKeysPage } from "@/features/api-keys/pages/api-keys-page";
import { parseApiKeySearch } from "@/lib/list-search";

export const Route = createFileRoute("/api-keys")({
  validateSearch: parseApiKeySearch,
  component: ApiKeysRoute,
});

function ApiKeysRoute() {
  const { session } = useSession();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  return (
    <ApiKeysPage
      defaultGroup={session?.user.group}
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }) })
      }
    />
  );
}
