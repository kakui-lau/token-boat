import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthCapabilities, ConsoleSession } from "@/data/contracts";
import { SessionProvider, useSession } from "../session-context";

const { getAuthCapabilities, getSession, signIn, signOut } = vi.hoisted(() => ({
  getAuthCapabilities: vi.fn(),
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    completeOAuthLogin: vi.fn(),
    confirmPasswordReset: vi.fn(),
    createOAuthLoginFlow: vi.fn(),
    getAuthCapabilities,
    getSession,
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    sendEmailVerification: vi.fn(),
    signIn,
    signInWithPasskey: vi.fn(),
    signOut,
    verifyTwoFactorLogin: vi.fn(),
  },
}));

beforeEach(() => {
  getAuthCapabilities.mockReset();
  getSession.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  getSession.mockResolvedValue(null);
  getAuthCapabilities.mockResolvedValue(authCapabilitiesFixture());
});

describe("SessionProvider query ownership", () => {
  test("writes an authenticated session to the QueryClient that owns the provider", async () => {
    const session = sessionFixture();
    signIn.mockResolvedValue({ kind: "authenticated", session });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign in probe" }));

    await waitFor(() => expect(screen.getByText("merchant")).toBeVisible());
    expect(queryClient.getQueryData(["session"])).toEqual(session);
  });

  test("retries the public authentication capability query without reloading the page", async () => {
    getAuthCapabilities
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(authCapabilitiesFixture());
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <CapabilitiesProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("capabilities unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry capabilities" }));

    await waitFor(() => expect(screen.getByText("password available")).toBeVisible());
    expect(getAuthCapabilities).toHaveBeenCalledTimes(2);
  });

  test("coalesces repeated sign-out requests while the first request is pending", async () => {
    signOut.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SignOutProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sign out twice" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
  });
});

function SessionProbe() {
  const session = useSession();
  return (
    <div>
      <span>{session.session?.user.username ?? "signed out"}</span>
      <button
        onClick={() => void session.signIn({ username: "merchant", password: "secret" })}
        type="button"
      >
        Sign in probe
      </button>
    </div>
  );
}

function CapabilitiesProbe() {
  const session = useSession();
  return (
    <div>
      <span>
        {session.capabilities?.passwordEnabled ? "password available" : "capabilities unavailable"}
      </span>
      <button onClick={() => void session.retryCapabilities()} type="button">
        Retry capabilities
      </button>
    </div>
  );
}

function SignOutProbe() {
  const session = useSession();
  return (
    <button
      onClick={() => {
        void session.signOut();
        void session.signOut();
      }}
      type="button"
    >
      Sign out twice
    </button>
  );
}

function sessionFixture(): ConsoleSession {
  return {
    sessionId: "session-provider",
    user: {
      id: 1,
      username: "merchant",
      displayName: "Merchant",
      email: "merchant@example.com",
      group: "default",
      role: 1,
      quota: 100,
      usedQuota: 10,
      requestCount: 2,
      createdAt: 1_700_000_000,
    },
  };
}

function authCapabilitiesFixture(): AuthCapabilities {
  return {
    emailVerificationEnabled: false,
    oauthProviders: [],
    passkeyEnabled: false,
    passwordEnabled: true,
    registrationEnabled: true,
    turnstileEnabled: false,
    turnstileSiteKey: "",
  };
}
