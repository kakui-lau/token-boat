import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountData } from "@/data/contracts";
import { AccountPage } from "../pages/account-page";

const { getAccount, updateProfile } = vi.hoisted(() => ({
  getAccount: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({ session: null }),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    getAccount,
    updateProfile,
    updatePreferences: vi.fn(),
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  getAccount.mockReset();
  updateProfile.mockReset();
});

describe("AccountPage editable drafts", () => {
  test("does not overwrite an unsaved profile when the same account refetches", async () => {
    const account = accountFixture();
    getAccount.mockResolvedValue(account);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AccountPage activeTab="profile" onTabChange={vi.fn()} />
      </QueryClientProvider>,
    );

    const displayName = await screen.findByRole("textbox", { name: "Display name" });
    fireEvent.change(displayName, { target: { value: "Unsaved merchant name" } });
    act(() => {
      queryClient.setQueryData<AccountData>(["account"], {
        ...account,
        user: { ...account.user, displayName: "Background refresh name" },
      });
    });

    await waitFor(() => expect(displayName).toHaveValue("Unsaved merchant name"));
  });

  test("retries the account query without leaving the settings page", async () => {
    getAccount.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(accountFixture());

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    expect(await screen.findByText("Unable to load account settings")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("textbox", { name: "Display name" })).toHaveValue(
      "Merchant owner",
    );
    expect(getAccount).toHaveBeenCalledTimes(2);
  });

  test("updates the QueryClient owned by the rendered application", async () => {
    const account = accountFixture();
    const updatedAccount = {
      ...account,
      user: { ...account.user, displayName: "Updated merchant" },
    };
    getAccount.mockResolvedValue(account);
    updateProfile.mockResolvedValue(updatedAccount);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    renderAccountPage(queryClient);

    fireEvent.change(await screen.findByRole("textbox", { name: "Display name" }), {
      target: { value: "Updated merchant" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(queryClient.getQueryData<AccountData>(["account"])?.user.displayName).toBe(
        "Updated merchant",
      ),
    );
  });
});

function renderAccountPage(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountPage activeTab="profile" onTabChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

function accountFixture(): AccountData {
  return {
    user: {
      id: 12,
      username: "merchant",
      displayName: "Merchant owner",
      email: "owner@example.com",
      group: "default",
      role: 1,
      quota: 100,
      usedQuota: 10,
      requestCount: 2,
      createdAt: 1_700_000_000,
    },
    preferences: {
      balanceWarningThresholdUsd: 1,
      barkUrl: "",
      gotifyPriority: 5,
      gotifyToken: "",
      gotifyTokenConfigured: false,
      gotifyUrl: "",
      notificationEmail: "",
      notifyType: "email",
      recordIpLog: false,
      webhookSecret: "",
      webhookSecretConfigured: false,
      webhookUrl: "",
    },
    security: {
      backupCodesRemaining: null,
      emailBound: true,
      passkeyEnabled: false,
      passkeyLastUsedAt: null,
      twoFactorEnabled: false,
      twoFactorLocked: false,
    },
    sessions: [],
  };
}
