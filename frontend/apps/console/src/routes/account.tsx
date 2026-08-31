import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AccountPage } from "@/features/account/pages/account-page";
import { accountSearchSchema, type AccountTab } from "@/features/account/lib/account-tabs";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
  validateSearch: accountSearchSchema,
});

function AccountRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const handleTabChange = (tab: AccountTab) => {
    void navigate({ replace: true, search: { tab }, to: "/account" });
  };

  return <AccountPage activeTab={search.tab} onTabChange={handleTabChange} />;
}
