import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountData, AccountSecurityResult } from "@/data/contracts";
import { PasskeySettingsCard } from "../components/passkey-settings-card";
import { TwoFactorSettingsCard } from "../components/two-factor-settings-card";

const {
  disableTwoFactor,
  enableTwoFactor,
  registerPasskey,
  regenerateTwoFactorBackupCodes,
  removePasskey,
  setupTwoFactor,
} = vi.hoisted(() => ({
  disableTwoFactor: vi.fn(),
  enableTwoFactor: vi.fn(),
  registerPasskey: vi.fn(),
  regenerateTwoFactorBackupCodes: vi.fn(),
  removePasskey: vi.fn(),
  setupTwoFactor: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    disableTwoFactor,
    enableTwoFactor,
    registerPasskey,
    regenerateTwoFactorBackupCodes,
    removePasskey,
    setupTwoFactor,
  },
}));

vi.mock("@/lib/webauthn", () => ({ isWebAuthnSupported: () => true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

const disabledSecurity: AccountData["security"] = {
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
};

const enabledSecurity: AccountData["security"] = {
  ...disabledSecurity,
  backupCodesRemaining: 8,
  passkeyEnabled: true,
  twoFactorEnabled: true,
};

const securityResult = {
  account: { security: disabledSecurity },
  session: { accessToken: "rotated" },
} as AccountSecurityResult;

beforeEach(() => {
  disableTwoFactor.mockReset();
  enableTwoFactor.mockReset();
  registerPasskey.mockReset();
  regenerateTwoFactorBackupCodes.mockReset();
  removePasskey.mockReset();
  setupTwoFactor.mockReset();
});

describe("account security settings", () => {
  test("shows the QR and recovery codes before enabling 2FA", async () => {
    let resolveEnable!: (result: AccountSecurityResult) => void;
    setupTwoFactor.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrCodeData: "otpauth://totp/TokenBoat:owner?secret=JBSWY3DPEHPK3PXP",
      backupCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
    });
    enableTwoFactor.mockImplementation(
      () =>
        new Promise<AccountSecurityResult>((resolve) => {
          resolveEnable = resolve;
        }),
    );
    const onUpdated = vi.fn();
    renderWithQuery(<TwoFactorSettingsCard onUpdated={onUpdated} security={disabledSecurity} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("2FA QR code")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("JBSWY3DPEHPK3PXP")).toHaveAttribute("readonly");
    expect(within(dialog).getByText("RECOVERY-ONE")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    const enableButton = within(dialog).getByRole("button", { name: "Enable 2FA" });
    act(() => {
      enableButton.click();
      enableButton.click();
    });

    await waitFor(() => expect(enableTwoFactor).toHaveBeenCalledTimes(1));
    expect(enableTwoFactor.mock.calls[0]?.[0]).toBe("123456");
    await waitFor(() => {
      expect(enableButton).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeVisible();

    await act(async () => resolveEnable(securityResult));
    expect(onUpdated).toHaveBeenCalledWith(securityResult);
    expect(await within(dialog).findByText("2FA is now enabled")).toBeInTheDocument();
  });

  test("deduplicates 2FA setup and retries it inside the open dialog", async () => {
    let rejectSetup!: (reason: Error) => void;
    setupTwoFactor
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectSetup = reject;
          }),
      )
      .mockResolvedValueOnce({
        secret: "JBSWY3DPEHPK3PXP",
        qrCodeData: "otpauth://totp/TokenBoat:owner?secret=JBSWY3DPEHPK3PXP",
        backupCodes: ["RECOVERY-ONE"],
      });
    renderWithQuery(<TwoFactorSettingsCard onUpdated={vi.fn()} security={disabledSecurity} />);

    const openButton = screen.getByRole("button", { name: "Enable 2FA" });
    act(() => {
      openButton.click();
      openButton.click();
    });

    await waitFor(() => expect(setupTwoFactor).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole("dialog");
    await act(async () => rejectSetup(new Error("setup unavailable")));
    expect(await within(dialog).findByText("Unable to load two-factor setup")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Retry setup" }));
    await waitFor(() => expect(setupTwoFactor).toHaveBeenCalledTimes(2));
    expect(await within(dialog).findByLabelText("2FA QR code")).toBeVisible();
  });

  test("requires the current 2FA code before registering a Passkey", async () => {
    registerPasskey.mockResolvedValue(securityResult);
    const onUpdated = vi.fn();
    renderWithQuery(
      <PasskeySettingsCard
        onUpdated={onUpdated}
        security={{ ...disabledSecurity, twoFactorEnabled: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Register Passkey" }));

    const dialog = await screen.findByRole("dialog");
    const continueButton = within(dialog).getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Authenticator or recovery code"), {
      target: { value: "654321" },
    });
    fireEvent.click(continueButton);

    await waitFor(() => expect(registerPasskey).toHaveBeenCalledWith("654321"));
    expect(onUpdated).toHaveBeenCalledWith(securityResult);
  });

  test("deduplicates Passkey registration and unlocks the dialog after failure", async () => {
    let rejectRegistration!: (reason: Error) => void;
    registerPasskey
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectRegistration = reject;
          }),
      )
      .mockResolvedValueOnce(securityResult);
    renderWithQuery(
      <PasskeySettingsCard
        onUpdated={vi.fn()}
        security={{ ...disabledSecurity, twoFactorEnabled: true }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Register Passkey" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Authenticator or recovery code"), {
      target: { value: "654321" },
    });
    const continueButton = within(dialog).getByRole("button", { name: "Continue" });
    act(() => {
      continueButton.click();
      continueButton.click();
    });

    await waitFor(() => expect(registerPasskey).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(continueButton).toBeDisabled();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
      expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeVisible();

    await act(async () => rejectRegistration(new Error("registration failed")));
    await waitFor(() => expect(continueButton).toBeEnabled());
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();

    fireEvent.click(continueButton);
    await waitFor(() => expect(registerPasskey).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("deduplicates Passkey removal and locks its confirmation until completion", async () => {
    let resolveRemoval!: (result: AccountSecurityResult) => void;
    removePasskey.mockImplementation(
      () =>
        new Promise<AccountSecurityResult>((resolve) => {
          resolveRemoval = resolve;
        }),
    );
    renderWithQuery(<PasskeySettingsCard onUpdated={vi.fn()} security={enabledSecurity} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Passkey" }));
    const confirmation = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirmation).getByLabelText("Authenticator or recovery code"), {
      target: { value: "654321" },
    });
    const removeButton = within(confirmation).getByRole("button", { name: "Remove Passkey" });
    act(() => {
      removeButton.click();
      removeButton.click();
    });

    await waitFor(() => expect(removePasskey).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(removeButton).toBeDisabled();
      expect(within(confirmation).getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
    await act(async () => resolveRemoval(securityResult));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  test("keeps regenerated recovery codes visible until they are explicitly saved", async () => {
    let resolveCodes!: (result: AccountSecurityResult) => void;
    regenerateTwoFactorBackupCodes.mockImplementation(
      () =>
        new Promise<AccountSecurityResult>((resolve) => {
          resolveCodes = resolve;
        }),
    );
    const regeneratedResult = {
      ...securityResult,
      backupCodes: ["NEW-CODE-ONE", "NEW-CODE-TWO"],
    } as AccountSecurityResult;
    renderWithQuery(<TwoFactorSettingsCard onUpdated={vi.fn()} security={enabledSecurity} />);

    fireEvent.click(screen.getByRole("button", { name: "Regenerate recovery codes" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    const regenerateButton = within(dialog).getByRole("button", { name: "Regenerate codes" });
    act(() => {
      regenerateButton.click();
      regenerateButton.click();
    });

    await waitFor(() => expect(regenerateTwoFactorBackupCodes).toHaveBeenCalledTimes(1));
    await act(async () => resolveCodes(regeneratedResult));
    expect(await within(dialog).findByText("NEW-CODE-ONE")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "I have saved the recovery codes" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  test("deduplicates 2FA disable and keeps its confirmation after failure", async () => {
    let rejectDisable!: (reason: Error) => void;
    disableTwoFactor
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectDisable = reject;
          }),
      )
      .mockResolvedValueOnce(securityResult);
    renderWithQuery(<TwoFactorSettingsCard onUpdated={vi.fn()} security={enabledSecurity} />);

    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));
    const confirmation = await screen.findByRole("alertdialog");
    fireEvent.change(within(confirmation).getByLabelText("Authenticator or recovery code"), {
      target: { value: "123456" },
    });
    const disableButton = within(confirmation).getByRole("button", { name: "Disable 2FA" });
    act(() => {
      disableButton.click();
      disableButton.click();
    });

    await waitFor(() => expect(disableTwoFactor).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(disableButton).toBeDisabled();
      expect(within(confirmation).getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
    await act(async () => rejectDisable(new Error("verification failed")));
    await waitFor(() => expect(disableButton).toBeEnabled());
    expect(confirmation).toBeVisible();

    fireEvent.click(disableButton);
    await waitFor(() => expect(disableTwoFactor).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
