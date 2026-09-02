import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AccountPage } from "@/features/account/pages/account-page";
import { parseAccountSearch, type AccountTab } from "@/features/account/lib/account-tabs";

export const Route = createFileRoute("/account")({
  component: AccountRoute,
  validateSearch: parseAccountSearch,
});

function AccountRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  const handleTabChange = (tab: AccountTab) => {
    void navigate({ replace: true, search: { tab }, to: "/account" });
  };

  return <AccountPage activeTab={search.tab ?? "profile"} onTabChange={handleTabChange} />;
}
