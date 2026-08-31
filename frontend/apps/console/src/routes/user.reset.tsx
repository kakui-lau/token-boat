import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordPage } from "@/features/auth/pages/reset-password-page";

export const Route = createFileRoute("/user/reset")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
  const { email, token } = Route.useSearch();
  return <ResetPasswordPage email={email} token={token} />;
}
