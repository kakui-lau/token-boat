import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { TeamPage } from "../pages/team-page";

const { listTeamMembers } = vi.hoisted(() => ({ listTeamMembers: vi.fn() }));

vi.mock("@/data/repository", () => ({
  repository: { mode: "live", listTeamMembers },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

describe("TeamPage live workspace boundary", () => {
  test("does not synthesize the current user as a workspace member", async () => {
    listTeamMembers.mockResolvedValue([]);

    renderTeamPage();

    expect(await screen.findByText("Member directory unavailable")).toBeInTheDocument();
    expect(screen.getByText("Personal workspace")).toBeInTheDocument();
    expect(screen.getByText("Personal workspace active")).toBeInTheDocument();
    expect(screen.getByText("Planned role boundaries")).toBeInTheDocument();
    expect(screen.queryByText("Merchant Owner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invite member" })).not.toBeInTheDocument();
  });

  test("distinguishes a failed member request from an empty workspace", async () => {
    listTeamMembers.mockRejectedValue(new Error("offline"));

    renderTeamPage();

    expect(await screen.findByText("Unable to load team members")).toBeInTheDocument();
    expect(screen.queryByText("No team members yet")).not.toBeInTheDocument();
  });
});

function renderTeamPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamPage />
    </QueryClientProvider>,
  );
}
