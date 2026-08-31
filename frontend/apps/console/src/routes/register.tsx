import { createFileRoute } from "@tanstack/react-router";

import { RegisterPage } from "@/features/auth/pages/register-page";
import { normalizeConsoleRedirect } from "@/features/auth/lib/auth-redirect";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    aff: typeof search.aff === "string" ? search.aff.trim().slice(0, 32) : undefined,
    redirect: normalizeConsoleRedirect(search.redirect),
  }),
  component: RegisterRoute,
});

function RegisterRoute() {
  const { aff, redirect } = Route.useSearch();
  return <RegisterPage affiliateCode={aff} redirectTo={redirect} />;
}
