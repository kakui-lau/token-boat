import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    setupTwoFactor.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      qrCodeData: "otpauth://totp/TokenBoat:owner?secret=JBSWY3DPEHPK3PXP",
      backupCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
    });
    enableTwoFactor.mockResolvedValue(securityResult);
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Enable 2FA" }));

    await waitFor(() => expect(enableTwoFactor).toHaveBeenCalled());
    expect(enableTwoFactor.mock.calls[0]?.[0]).toBe("123456");
    expect(onUpdated).toHaveBeenCalledWith(securityResult);
    expect(await within(dialog).findByText("2FA is now enabled")).toBeInTheDocument();
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
});

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
