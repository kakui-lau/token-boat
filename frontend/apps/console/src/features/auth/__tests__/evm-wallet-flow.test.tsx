import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSiweMessage } from "viem/siwe";

import { EVMWalletButton } from "../components/evm-wallet-button";

const {
  beginEVMWalletAuth,
  completeEVMWalletAuth,
  connectAsync,
  connector,
  disconnectAsync,
  getProvider,
  signMessageAsync,
  toastError,
  toastInfo,
} = vi.hoisted(() => ({
  beginEVMWalletAuth: vi.fn(),
  completeEVMWalletAuth: vi.fn(),
  connectAsync: vi.fn(),
  connector: { id: "io.metamask", name: "MetaMask", uid: "wallet-1" },
  disconnectAsync: vi.fn(),
  getProvider: vi.fn(),
  signMessageAsync: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

Object.assign(connector, { getProvider });

vi.mock("wagmi", () => ({
  WagmiProvider: ({ children }: { children: ReactNode }) => children,
  useConnect: () => ({ connectAsync }),
  useConnectors: () => [connector],
  useDisconnect: () => ({ disconnectAsync }),
  useSignMessage: () => ({ signMessageAsync }),
}));

vi.mock("@/lib/wagmi", () => ({ wagmiConfig: {} }));
vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({ beginEVMWalletAuth, completeEVMWalletAuth }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, info: toastInfo, success: vi.fn() },
}));

const address = "0x52908400098527886E0F7030069857D2E4169EE7";

beforeEach(() => {
  beginEVMWalletAuth.mockReset();
  completeEVMWalletAuth.mockReset();
  connectAsync.mockReset();
  disconnectAsync.mockReset();
  getProvider.mockReset();
  signMessageAsync.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
  connectAsync.mockResolvedValue({ accounts: [address], chainId: 1 });
  disconnectAsync.mockResolvedValue(undefined);
  getProvider.mockResolvedValue({});
  signMessageAsync.mockResolvedValue(`0x${"ab".repeat(65)}`);
  const nonce = "Nonce12345678";
  beginEVMWalletAuth.mockResolvedValue({
    address,
    chainId: 1,
    expiresAt: Math.floor(Date.now() / 1_000) + 300,
    flowToken: "evm-flow",
    message: createSiweMessage({
      address,
      chainId: 1,
      domain: window.location.host,
      expirationTime: new Date(Date.now() + 300_000),
      issuedAt: new Date(),
      nonce,
      statement: "Sign in to Token Boat.",
      uri: window.location.origin,
      version: "1",
    }),
    nonce,
  });
  completeEVMWalletAuth.mockResolvedValue({ user: { username: "evm-user" } });
});

describe("EVM wallet authentication", () => {
  test("presents wallet access as one compact, accessible action", () => {
    const { container } = render(<EVMWalletButton intent="login" onAuthenticated={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Continue with EVM wallet" });
    expect(button).toContainElement(container.querySelector('[data-slot="evm-wallet-summary"]'));
    expect(button).toHaveTextContent(
      "Sign a one-time message. No blockchain transaction or gas fee is required.",
    );
  });

  test("connects, validates SIWE, signs, completes login, and disconnects the wallet", async () => {
    const onAuthenticated = vi.fn();
    const onHumanVerificationConsumed = vi.fn();
    render(
      <EVMWalletButton
        affiliateCode="partner-code"
        intent="register"
        onAuthenticated={onAuthenticated}
        onHumanVerificationConsumed={onHumanVerificationConsumed}
        turnstileToken="human-token"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with EVM wallet" }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
    expect(beginEVMWalletAuth).toHaveBeenCalledWith({
      address,
      affiliateCode: "partner-code",
      chainId: 1,
      intent: "register",
      turnstileToken: "human-token",
    });
    expect(onHumanVerificationConsumed).toHaveBeenCalledOnce();
    expect(signMessageAsync).toHaveBeenCalledWith({
      account: address,
      connector,
      message: expect.stringContaining("wants you to sign in with your Ethereum account"),
    });
    expect(completeEVMWalletAuth).toHaveBeenCalledWith({
      flowToken: "evm-flow",
      signature: `0x${"ab".repeat(65)}`,
    });
    expect(disconnectAsync).toHaveBeenCalledWith({ connector });
  });

  test("does not create a challenge when no configured wallet provider is available", async () => {
    getProvider.mockResolvedValue(undefined);
    render(<EVMWalletButton intent="login" onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with EVM wallet" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("No EVM wallet was found in this browser."),
    );
    expect(beginEVMWalletAuth).not.toHaveBeenCalled();
  });

  test("requires completed human verification before wallet login can create an account", async () => {
    render(<EVMWalletButton humanVerificationRequired intent="login" onAuthenticated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with EVM wallet" }));

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith("Complete the human verification first"),
    );
    expect(getProvider).not.toHaveBeenCalled();
    expect(beginEVMWalletAuth).not.toHaveBeenCalled();
  });
});
