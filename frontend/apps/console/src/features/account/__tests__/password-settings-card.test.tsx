import { ApiClientError } from "@token-boat/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountSecurityResult } from "@/data/contracts";
import { PasswordSettingsCard } from "../components/password-settings-card";

const {
  beginEVMWalletPasswordSetup,
  changePassword,
  completeEVMWalletPasswordSetup,
  toastError,
  toastSuccess,
} = vi.hoisted(() => ({
  beginEVMWalletPasswordSetup: vi.fn(),
  changePassword: vi.fn(),
  completeEVMWalletPasswordSetup: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    beginEVMWalletPasswordSetup,
    changePassword,
    completeEVMWalletPasswordSetup,
  },
}));

vi.mock("@/features/auth/components/evm-wallet-button", () => ({
  EVMWalletButton: (props: {
    beginChallenge(input: { address: string; chainId: number }): Promise<{ flowToken: string }>;
    buttonLabel: string;
    completeChallenge(input: { flowToken: string; signature: string }): Promise<unknown>;
    disabled?: boolean;
    onAuthenticated(): void | Promise<void>;
  }) => (
    <button
      disabled={props.disabled}
      onClick={async () => {
        const challenge = await props.beginChallenge({ address: "0xwallet", chainId: 1 });
        await props.completeChallenge({
          flowToken: challenge.flowToken,
          signature: "0xsignature",
        });
        await props.onAuthenticated();
      }}
      type="button"
    >
      {props.buttonLabel}
    </button>
  ),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const securityResult = {
  account: { user: { username: "merchant-owner" } },
  session: { accessToken: "rotated-access-token" },
} as AccountSecurityResult;

beforeEach(() => {
  changePassword.mockReset();
  beginEVMWalletPasswordSetup.mockReset();
  completeEVMWalletPasswordSetup.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("PasswordSettingsCard", () => {
  test("validates password rules before calling the repository", async () => {
    renderWithQuery(<PasswordSettingsCard evmWalletEnabled onUpdated={vi.fn()} passwordSet />);

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Current password"), {
      target: { value: "current-password" },
    });
    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(within(dialog).getByLabelText("Confirm new password"), {
      target: { value: "different" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change password" }));

    expect(
      await within(dialog).findByText("Password must be between 8 and 20 characters."),
    ).toBeVisible();
    expect(within(dialog).getByText("Passwords do not match")).toBeVisible();
    expect(changePassword).not.toHaveBeenCalled();
  });

  test("deduplicates submission, keeps the dialog open while pending, and clears it on success", async () => {
    let resolveChange!: (result: AccountSecurityResult) => void;
    changePassword.mockImplementation(
      () =>
        new Promise<AccountSecurityResult>((resolve) => {
          resolveChange = resolve;
        }),
    );
    const onUpdated = vi.fn();
    renderWithQuery(<PasswordSettingsCard evmWalletEnabled onUpdated={onUpdated} passwordSet />);

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    fillValidPasswordForm(dialog);
    const submit = within(dialog).getByRole("button", { name: "Change password" });
    act(() => {
      submit.click();
      submit.click();
    });

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: "current-password",
        newPassword: "replacement-password",
      }),
    );
    expect(changePassword).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Changing password…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeVisible();

    await act(async () => resolveChange(securityResult));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(onUpdated).toHaveBeenCalledWith(securityResult);
    expect(toastSuccess).toHaveBeenCalledWith("Password changed", {
      description: "Your password has been updated and this session remains active.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const reopenedDialog = await screen.findByRole("dialog");
    expect(within(reopenedDialog).getByLabelText("Current password")).toHaveValue("");
    expect(within(reopenedDialog).getByLabelText("New password")).toHaveValue("");
    expect(within(reopenedDialog).getByLabelText("Confirm new password")).toHaveValue("");
  });

  test("keeps the form available and shows the backend error after a failed change", async () => {
    changePassword.mockRejectedValue(new ApiClientError("Current password is incorrect.", 400));
    renderWithQuery(<PasswordSettingsCard evmWalletEnabled onUpdated={vi.fn()} passwordSet />);

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog");
    fillValidPasswordForm(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Current password is incorrect."));
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Change password" })).toBeEnabled();
    expect(within(dialog).getByLabelText("Current password")).toHaveValue("current-password");
  });

  test("sets the first password only after the bound wallet signs a one-time challenge", async () => {
    beginEVMWalletPasswordSetup.mockResolvedValue({ flowToken: "password-flow" });
    completeEVMWalletPasswordSetup.mockResolvedValue(securityResult);
    const onUpdated = vi.fn();
    renderWithQuery(
      <PasswordSettingsCard evmWalletEnabled onUpdated={onUpdated} passwordSet={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Set password" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText("Current password")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("New password"), {
      target: { value: "wallet-password" },
    });
    fireEvent.change(within(dialog).getByLabelText("Confirm new password"), {
      target: { value: "wallet-password" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Verify wallet and set password" }));

    await waitFor(() =>
      expect(beginEVMWalletPasswordSetup).toHaveBeenCalledWith({
        address: "0xwallet",
        chainId: 1,
      }),
    );
    expect(completeEVMWalletPasswordSetup).toHaveBeenCalledWith({
      flowToken: "password-flow",
      signature: "0xsignature",
      newPassword: "wallet-password",
    });
    expect(onUpdated).toHaveBeenCalledWith(securityResult);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

function fillValidPasswordForm(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText("Current password"), {
    target: { value: "current-password" },
  });
  fireEvent.change(within(dialog).getByLabelText("New password"), {
    target: { value: "replacement-password" },
  });
  fireEvent.change(within(dialog).getByLabelText("Confirm new password"), {
    target: { value: "replacement-password" },
  });
}

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
