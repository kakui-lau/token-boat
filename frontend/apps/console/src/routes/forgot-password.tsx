import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordPage } from "@/features/auth/pages/forgot-password-page";
import { normalizeConsoleRedirect } from "@/features/auth/lib/auth-redirect";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: normalizeConsoleRedirect(search.redirect),
  }),
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const { redirect } = Route.useSearch();
  return <ForgotPasswordPage redirectTo={redirect} />;
}
