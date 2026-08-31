import { createFileRoute } from "@tanstack/react-router";

import { SignInPage } from "@/features/auth/pages/sign-in-page";
import { normalizeConsoleRedirect } from "@/features/auth/lib/auth-redirect";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: normalizeConsoleRedirect(search.redirect),
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const { redirect } = Route.useSearch();
  return <SignInPage redirectTo={redirect} />;
}
