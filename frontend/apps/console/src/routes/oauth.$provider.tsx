import { createFileRoute } from "@tanstack/react-router";

import { OAuthCallbackPage } from "@/features/auth/pages/oauth-callback-page";

export const Route = createFileRoute("/oauth/$provider")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    errorDescription:
      typeof search.error_description === "string" ? search.error_description : undefined,
    state: typeof search.state === "string" ? search.state : "",
  }),
  component: OAuthCallbackRoute,
});

function OAuthCallbackRoute() {
  const { provider } = Route.useParams();
  const search = Route.useSearch();
  return <OAuthCallbackPage provider={provider} {...search} />;
}
