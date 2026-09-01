import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthCapabilities, ConsoleSession } from "@/data/contracts";
import { resolveSessionRefreshInterval, SessionProvider, useSession } from "../session-context";

const {
  clearLocalSession,
  closeSessionSync,
  getAuthCapabilities,
  getSession,
  publishSessionSync,
  sessionSyncState,
  signIn,
  signOut,
} = vi.hoisted(() => ({
  clearLocalSession: vi.fn(),
  closeSessionSync: vi.fn(),
  getAuthCapabilities: vi.fn(),
  getSession: vi.fn(),
  publishSessionSync: vi.fn(),
  sessionSyncState: {
    listener: null as null | ((event: "authenticated" | "signed-out") => void),
  },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../session-sync", () => ({
  createSessionSync: (listener: (event: "authenticated" | "signed-out") => void) => {
    sessionSyncState.listener = listener;
    return { close: closeSessionSync, publish: publishSessionSync };
  },
}));

vi.mock("@/data/repository", () => ({
  repository: {
    mode: "live",
    clearLocalSession,
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
  clearLocalSession.mockReset();
  closeSessionSync.mockReset();
  getAuthCapabilities.mockReset();
  getSession.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  publishSessionSync.mockReset();
  sessionSyncState.listener = null;
  getSession.mockResolvedValue(null);
  getAuthCapabilities.mockResolvedValue(authCapabilitiesFixture());
});

describe("SessionProvider query ownership", () => {
  test("refreshes access credentials before expiry and backs off after a transient failure", () => {
    const now = 1_700_000_000_000;
    const session = sessionFixture({
      accessExpiresAt: now / 1_000 + 15 * 60,
      accessToken: "access-token",
    });

    expect(resolveSessionRefreshInterval(session, false, now)).toBe(14 * 60_000);
    expect(resolveSessionRefreshInterval(session, true, now)).toBe(30_000);
    expect(resolveSessionRefreshInterval(sessionFixture(), false, now)).toBe(false);
  });

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
    expect(publishSessionSync).toHaveBeenCalledWith("authenticated");
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
    const session = sessionFixture();
    getSession.mockResolvedValue(session);
    signOut.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["account"], { owner: "merchant" });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SignOutProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("merchant")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sign out twice" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText("signed out")).toBeVisible());
    expect(queryClient.getQueryData(["account"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth-capabilities"])).toEqual(authCapabilitiesFixture());
    expect(publishSessionSync).toHaveBeenCalledWith("signed-out");
  });

  test("clears credentials and cached data when another tab signs out", async () => {
    const session = sessionFixture();
    getSession.mockResolvedValue(session);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(["account"], { owner: "merchant" });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("merchant")).toBeVisible();
    act(() => sessionSyncState.listener?.("signed-out"));

    await waitFor(() => expect(screen.getByText("signed out")).toBeVisible());
    expect(clearLocalSession).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["account"])).toBeUndefined();
    expect(publishSessionSync).not.toHaveBeenCalled();
  });

  test("restores a session from the refresh cookie when another tab signs in", async () => {
    const session = sessionFixture();
    getSession.mockResolvedValueOnce(null).mockResolvedValueOnce(session);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("signed out")).toBeVisible();
    act(() => sessionSyncState.listener?.("authenticated"));

    await waitFor(() => expect(screen.getByText("merchant")).toBeVisible());
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(getSession).toHaveBeenNthCalledWith(2, { ignoreCurrentSession: true });
    expect(publishSessionSync).not.toHaveBeenCalled();
  });

  test("does not restore a stale refresh result after a newer cross-tab sign-out", async () => {
    const session = sessionFixture();
    let resolveRemoteRefresh: ((value: ConsoleSession) => void) | undefined;
    getSession.mockResolvedValueOnce(null).mockImplementationOnce(
      () =>
        new Promise<ConsoleSession>((resolve) => {
          resolveRemoteRefresh = resolve;
        }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("signed out")).toBeVisible();
    act(() => sessionSyncState.listener?.("authenticated"));
    act(() => sessionSyncState.listener?.("signed-out"));
    await act(async () => resolveRemoteRefresh?.(session));

    expect(screen.getByText("signed out")).toBeVisible();
    expect(queryClient.getQueryData(["session"])).toBeNull();
  });

  test("cancels an in-flight bootstrap refresh when another tab signs out", async () => {
    const session = sessionFixture();
    let resolveBootstrap: ((value: ConsoleSession) => void) | undefined;
    getSession.mockImplementationOnce(
      (options?: { signal?: AbortSignal }) =>
        new Promise<ConsoleSession>((resolve, reject) => {
          resolveBootstrap = resolve;
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Session refresh cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SessionProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(sessionSyncState.listener).not.toBeNull());
    act(() => sessionSyncState.listener?.("signed-out"));
    expect(await screen.findByText("signed out")).toBeVisible();
    act(() => resolveBootstrap?.(session));

    expect(screen.getByText("signed out")).toBeVisible();
    expect(queryClient.getQueryData(["session"])).toBeNull();
    expect(clearLocalSession).toHaveBeenCalledOnce();
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
    <div>
      <span>{session.session?.user.username ?? "signed out"}</span>
      <button
        onClick={() => {
          void session.signOut();
          void session.signOut();
        }}
        type="button"
      >
        Sign out twice
      </button>
    </div>
  );
}

function sessionFixture(overrides: Partial<ConsoleSession> = {}): ConsoleSession {
  return {
    sessionId: "session-provider",
    user: {
      id: 1,
      username: "merchant",
      displayName: "Merchant",
      email: "merchant@example.com",
      group: "default",
      role: 1,
      quotaUnits: 100,
      usedQuotaUnits: 10,
      requestCount: 2,
      createdAt: 1_700_000_000,
    },
    ...overrides,
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
