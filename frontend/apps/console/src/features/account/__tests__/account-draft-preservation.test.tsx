import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountData } from "@/data/contracts";
import { AccountPage } from "../pages/account-page";

const {
  blockerState,
  getAccount,
  proceedNavigation,
  revokeOtherSessions,
  revokeSession,
  resetNavigation,
  sendEmailVerification,
  sessionCapabilities,
  updatePreferences,
  updateProfile,
  useBlocker,
} = vi.hoisted(() => ({
  blockerState: { blocked: false },
  getAccount: vi.fn(),
  proceedNavigation: vi.fn(),
  revokeOtherSessions: vi.fn(),
  revokeSession: vi.fn(),
  resetNavigation: vi.fn(),
  sendEmailVerification: vi.fn(),
  sessionCapabilities: {
    emailVerificationEnabled: false,
    turnstileEnabled: false,
    turnstileSiteKey: "",
  },
  updatePreferences: vi.fn(),
  updateProfile: vi.fn(),
  useBlocker: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useBlocker,
}));

vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    capabilities: sessionCapabilities,
    sendEmailVerification,
    session: null,
  }),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    getAccount,
    updateProfile,
    updatePreferences,
    revokeSession,
    revokeOtherSessions,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      ),
  }),
}));

beforeEach(() => {
  getAccount.mockReset();
  proceedNavigation.mockReset();
  revokeOtherSessions.mockReset();
  revokeSession.mockReset();
  resetNavigation.mockReset();
  sendEmailVerification.mockReset();
  updatePreferences.mockReset();
  updateProfile.mockReset();
  useBlocker.mockReset();
  blockerState.blocked = false;
  sessionCapabilities.emailVerificationEnabled = false;
  sessionCapabilities.turnstileEnabled = false;
  sessionCapabilities.turnstileSiteKey = "";
  useBlocker.mockImplementation((options: { disabled: boolean }) =>
    !options.disabled && blockerState.blocked
      ? {
          status: "blocked",
          proceed: proceedNavigation,
          reset: resetNavigation,
        }
      : { status: "idle" },
  );
});

describe("AccountPage editable drafts", () => {
  test("shows password management in the security tab", async () => {
    getAccount.mockResolvedValue(accountFixture());

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AccountPage activeTab="security" onTabChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Change password" })).toBeVisible();
  });

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

  test("keeps an existing username locked while saving a new email", async () => {
    const account = accountFixture();
    getAccount.mockResolvedValue(account);
    updateProfile.mockResolvedValue({
      ...account,
      user: { ...account.user, email: "new@example.com" },
    });

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    expect(await screen.findByRole("textbox", { name: "Username" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0]).toEqual({
      username: "merchant",
      displayName: "Merchant owner",
      email: "new@example.com",
      verificationCode: "",
    });
  });

  test("allows a wallet-created account to set its username exactly once", async () => {
    const account = {
      ...accountFixture(),
      user: {
        ...accountFixture().user,
        username: "evm_generated",
        usernameEditable: true,
        passwordSet: false,
      },
    };
    getAccount.mockResolvedValue(account);
    updateProfile.mockResolvedValue({
      ...account,
      user: {
        ...account.user,
        username: "wallet-owner",
        usernameEditable: false,
        passwordSet: false,
      },
    });

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const username = await screen.findByRole("textbox", { name: "Username" });
    expect(username).toBeEnabled();
    expect(username).toHaveValue("");
    fireEvent.change(username, { target: { value: "wallet-owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0]).toEqual({
      username: "wallet-owner",
      displayName: "Merchant owner",
      email: "owner@example.com",
      verificationCode: "",
    });
    await waitFor(() => expect(username).toHaveValue("wallet-owner"));
    expect(username).toBeDisabled();
  });

  test("requires an email code before saving a changed verified email", async () => {
    const account = accountFixture();
    sessionCapabilities.emailVerificationEnabled = true;
    getAccount.mockResolvedValue(account);
    sendEmailVerification.mockResolvedValue(undefined);
    updateProfile.mockResolvedValue({
      ...account,
      user: { ...account.user, email: "verified@example.com" },
    });

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.change(await screen.findByRole("textbox", { name: "Email" }), {
      target: { value: "verified@example.com" },
    });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() =>
      expect(sendEmailVerification).toHaveBeenCalledWith({
        email: "verified@example.com",
        turnstileToken: undefined,
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Email verification code" }), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ email: "verified@example.com", verificationCode: "123456" }),
    );
  });

  test("deduplicates profile saves without overwriting edits made while saving", async () => {
    const account = accountFixture();
    let resolveProfile!: (value: AccountData) => void;
    getAccount.mockResolvedValue(account);
    updateProfile.mockImplementation(
      () =>
        new Promise<AccountData>((resolve) => {
          resolveProfile = resolve;
        }),
    );

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const displayName = await screen.findByRole("textbox", { name: "Display name" });
    fireEvent.change(displayName, { target: { value: "Submitted merchant" } });
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    act(() => {
      saveButton.click();
      saveButton.click();
    });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    fireEvent.change(displayName, { target: { value: "Newer unsaved merchant" } });
    await act(async () =>
      resolveProfile({
        ...account,
        user: { ...account.user, displayName: "Submitted merchant" },
      }),
    );

    await waitFor(() => expect(displayName).toHaveValue("Newer unsaved merchant"));
    expect(useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false, enableBeforeUnload: true }),
    );
  });

  test("deduplicates preference saves without overwriting edits made while saving", async () => {
    const baseAccount = accountFixture();
    const account = {
      ...baseAccount,
      preferences: {
        ...baseAccount.preferences,
        notificationEmail: "owner@example.com",
      },
    };
    let resolvePreferences!: (value: AccountData) => void;
    getAccount.mockResolvedValue(account);
    updatePreferences.mockImplementation(
      () =>
        new Promise<AccountData>((resolve) => {
          resolvePreferences = resolve;
        }),
    );

    renderAccountPage(
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      "preferences",
    );

    const notificationEmail = await screen.findByRole("textbox", { name: "Notification email" });
    fireEvent.change(notificationEmail, { target: { value: "submitted@example.com" } });
    const saveButton = screen.getByRole("button", { name: "Save preferences" });
    await waitFor(() => expect(saveButton).toBeEnabled());
    const form = notificationEmail.closest("form")!;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1));
    fireEvent.change(notificationEmail, { target: { value: "newer@example.com" } });
    await act(async () =>
      resolvePreferences({
        ...account,
        preferences: { ...account.preferences, notificationEmail: "submitted@example.com" },
      }),
    );

    await waitFor(() => expect(notificationEmail).toHaveValue("newer@example.com"));
    expect(useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false, enableBeforeUnload: true }),
    );
  });

  test("deduplicates session revocation and releases the lock after failure", async () => {
    const account = {
      ...accountFixture(),
      sessions: [
        {
          id: "current-session",
          current: true,
          method: "password",
          ip: "192.0.2.1",
          userAgent: "Chrome on macOS",
          createdAt: 1_700_000_000,
          lastActiveAt: 1_700_000_100,
          expiresAt: 1_700_086_400,
        },
        {
          id: "other-session",
          current: false,
          method: "password",
          ip: "192.0.2.2",
          userAgent: "Safari on iPhone",
          createdAt: 1_700_000_000,
          lastActiveAt: 1_700_000_100,
          expiresAt: 1_700_086_400,
        },
      ],
    } satisfies AccountData;
    let rejectRevocation!: (reason: Error) => void;
    getAccount.mockResolvedValue(account);
    revokeSession
      .mockImplementationOnce(
        () =>
          new Promise<AccountData>((_resolve, reject) => {
            rejectRevocation = reject;
          }),
      )
      .mockResolvedValueOnce(account);

    renderAccountPage(
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
      "sessions",
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign out Safari on iPhone" }));
    const confirmation = await screen.findByRole("alertdialog", {
      name: "Sign out this session?",
    });
    const signOutButton = within(confirmation).getByRole("button", { name: "Sign out" });
    act(() => {
      signOutButton.click();
      signOutButton.click();
    });

    await waitFor(() => expect(revokeSession).toHaveBeenCalledTimes(1));
    await act(async () => rejectRevocation(new Error("offline")));
    await waitFor(() => expect(signOutButton).toBeEnabled());
    fireEvent.click(signOutButton);

    await waitFor(() => expect(revokeSession).toHaveBeenCalledTimes(2));
  });

  test("blocks navigation and browser unload while account changes are unsaved", async () => {
    getAccount.mockResolvedValue(accountFixture());
    blockerState.blocked = true;

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    fireEvent.change(await screen.findByRole("textbox", { name: "Display name" }), {
      target: { value: "Unsaved merchant name" },
    });

    expect(await screen.findByText("Discard unsaved changes?")).toBeVisible();
    expect(useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({
        disabled: false,
        enableBeforeUnload: true,
        withResolver: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(resetNavigation).toHaveBeenCalledTimes(1);
    expect(proceedNavigation).not.toHaveBeenCalled();
  });

  test("restores persisted account values before leaving with discarded changes", async () => {
    getAccount.mockResolvedValue(accountFixture());
    blockerState.blocked = true;

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const displayName = await screen.findByRole("textbox", { name: "Display name" });
    fireEvent.change(displayName, { target: { value: "Discard this name" } });
    fireEvent.click(await screen.findByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(displayName).toHaveValue("Merchant owner"));
    expect(proceedNavigation).toHaveBeenCalledTimes(1);
    expect(resetNavigation).not.toHaveBeenCalled();
    expect(useBlocker).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: true }));
  });

  test("does not block navigation after a profile field is restored to its persisted value", async () => {
    getAccount.mockResolvedValue(accountFixture());

    renderAccountPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const displayName = await screen.findByRole("textbox", { name: "Display name" });
    fireEvent.change(displayName, { target: { value: "Temporary name" } });
    expect(useBlocker).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: false }));

    fireEvent.change(displayName, { target: { value: "Merchant owner" } });
    expect(useBlocker).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true, enableBeforeUnload: false }),
    );
  });
});

function renderAccountPage(
  queryClient: QueryClient,
  activeTab: "profile" | "preferences" | "sessions" = "profile",
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountPage activeTab={activeTab} onTabChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

function accountFixture(): AccountData {
  return {
    user: {
      id: 12,
      username: "merchant",
      usernameEditable: false,
      passwordSet: true,
      displayName: "Merchant owner",
      email: "owner@example.com",
      group: "default",
      role: 1,
      quotaUnits: 100,
      usedQuotaUnits: 10,
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
      recordIpForced: false,
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
      evmWalletAddress: null,
      evmWalletEnabled: false,
      evmWalletLastUsedAt: null,
      evmWalletRemovable: false,
      evmWalletVerificationMethod: "password",
    },
    sessions: [],
  };
}
