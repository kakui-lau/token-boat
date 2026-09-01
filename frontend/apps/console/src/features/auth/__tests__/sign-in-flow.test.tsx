import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthCapabilities, OAuthProvider } from "@/data/contracts";
import { SignInPage } from "../pages/sign-in-page";

const {
  createOAuthLoginFlow,
  navigate,
  retryCapabilities,
  sessionState,
  signIn,
  signInWithPasskey,
  verifyTwoFactorLogin,
} = vi.hoisted(() => ({
  createOAuthLoginFlow: vi.fn(),
  navigate: vi.fn(),
  retryCapabilities: vi.fn(),
  signIn: vi.fn(),
  signInWithPasskey: vi.fn(),
  verifyTwoFactorLogin: vi.fn(),
  sessionState: {
    capabilities: {
      emailVerificationEnabled: false,
      oauthProviders: [] as OAuthProvider[],
      passkeyEnabled: false,
      passwordEnabled: true,
      registrationEnabled: true,
      turnstileEnabled: false,
      turnstileSiteKey: "",
    } as AuthCapabilities | null,
    capabilitiesLoading: false,
    capabilitiesRetrying: false,
    mode: "live" as const,
    session: null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search: _search,
    to,
    ...props
  }: ComponentProps<"a"> & { search?: unknown; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: "zh" },
    t: (key: string, values?: Record<string, string>) =>
      values
        ? Object.entries(values).reduce(
            (label, [name, value]) => label.replace(`{{${name}}}`, value),
            key,
          )
        : key,
  }),
}));
vi.mock("@/lib/webauthn", () => ({ isWebAuthnSupported: () => true }));
vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    ...sessionState,
    createOAuthLoginFlow,
    retryCapabilities,
    signIn,
    signInWithPasskey,
    verifyTwoFactorLogin,
  }),
}));

beforeEach(() => {
  createOAuthLoginFlow.mockReset();
  navigate.mockReset();
  retryCapabilities.mockReset();
  signIn.mockReset();
  signInWithPasskey.mockReset();
  verifyTwoFactorLogin.mockReset();
  sessionState.capabilities = {
    emailVerificationEnabled: false,
    oauthProviders: [],
    passkeyEnabled: false,
    passwordEnabled: true,
    registrationEnabled: true,
    turnstileEnabled: false,
    turnstileSiteKey: "",
  };
  sessionState.session = null;
  sessionState.capabilitiesLoading = false;
  sessionState.capabilitiesRetrying = false;
});

describe("User Console sign-in", () => {
  test("continues a password sign-in with the issued two-factor flow token", async () => {
    signIn.mockResolvedValue({
      kind: "two_factor",
      flowToken: "two-factor-flow",
      expiresAt: 1_800_000_000,
    });
    verifyTwoFactorLogin.mockResolvedValue(session);
    render(<SignInPage redirectTo="/console/logs?detail=request-1" />);

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "secured-user" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Two-factor authentication")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use backup code" }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "ABCD-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    await waitFor(() =>
      expect(verifyTwoFactorLogin).toHaveBeenCalledWith({
        code: "ABCD1234",
        flowToken: "two-factor-flow",
      }),
    );
    expect(navigate).toHaveBeenLastCalledWith({
      href: "/console/logs?detail=request-1",
      replace: true,
    });
  });

  test("uses the available Passkey method without requesting a password", async () => {
    sessionState.capabilities = {
      ...(sessionState.capabilities as AuthCapabilities),
      passkeyEnabled: true,
      passwordEnabled: false,
    };
    signInWithPasskey.mockResolvedValue(session);
    render(<SignInPage />);

    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Passkey" }));

    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenLastCalledWith({ to: "/", replace: true });
  });

  test("shows every OAuth provider enabled by the public status contract", () => {
    sessionState.capabilities = {
      ...(sessionState.capabilities as AuthCapabilities),
      oauthProviders: [
        {
          id: "github",
          name: "GitHub",
          clientId: "github-client",
          authorizationEndpoint: "https://github.com/login/oauth/authorize",
          scopes: "user:email",
          kind: "github",
        },
        {
          id: "company-sso",
          name: "Company SSO",
          clientId: "sso-client",
          authorizationEndpoint: "https://identity.example.com/authorize",
          scopes: "openid profile",
          kind: "custom",
        },
      ],
    };

    render(<SignInPage />);

    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with Company SSO" })).toBeVisible();
  });

  test("lets the user retry loading sign-in methods without refreshing the page", () => {
    sessionState.capabilities = null;
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retryCapabilities).toHaveBeenCalledOnce();
    expect(screen.getByText("Authentication service unavailable")).toBeVisible();
  });
});

const session = {
  user: {
    id: 9,
    username: "secured-user",
    displayName: "Secured User",
    email: "secured@example.com",
    group: "default",
    role: 1,
    quotaUnits: 100,
    usedQuotaUnits: 0,
    requestCount: 0,
    createdAt: 1_700_000_000,
  },
  sessionId: "session-id",
};
