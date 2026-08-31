import type { ComponentProps } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OAuthCallbackPage } from "../pages/oauth-callback-page";
import { rememberOAuthRedirect } from "../lib/auth-redirect";
import { buildOAuthAuthorizationUrl } from "../lib/oauth";

const { completeOAuthLogin, navigate } = vi.hoisted(() => ({
  completeOAuthLogin: vi.fn(),
  navigate: vi.fn(),
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
    t: (key: string) => key,
  }),
}));
vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({ completeOAuthLogin }),
}));

beforeEach(() => {
  completeOAuthLogin.mockReset();
  navigate.mockReset();
  window.sessionStorage.clear();
});

describe("User Console OAuth", () => {
  test("builds authorization URLs from the server-bound console callback", () => {
    const url = new URL(
      buildOAuthAuthorizationUrl(
        {
          id: "oidc",
          name: "Company SSO",
          clientId: "client-id",
          authorizationEndpoint: "https://identity.example.com/authorize?prompt=login",
          scopes: "openid profile email",
          kind: "oidc",
        },
        {
          flowToken: "oauth-state",
          redirectUri: "https://dashboard.example.com/console/oauth/oidc",
        },
      ),
    );

    expect(url.origin + url.pathname).toBe("https://identity.example.com/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://dashboard.example.com/console/oauth/oidc",
    );
    expect(url.searchParams.get("state")).toBe("oauth-state");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("prompt")).toBe("login");
  });

  test("rejects executable authorization endpoints", () => {
    expect(() =>
      buildOAuthAuthorizationUrl(
        {
          id: "unsafe",
          name: "Unsafe",
          clientId: "client-id",
          authorizationEndpoint: "javascript:alert(document.domain)",
          scopes: "openid",
          kind: "custom",
        },
        {
          flowToken: "oauth-state",
          redirectUri: "https://dashboard.example.com/console/oauth/unsafe",
        },
      ),
    ).toThrow("The OAuth authorization endpoint is invalid.");
  });

  test("exchanges the callback once and enters the authenticated console", async () => {
    completeOAuthLogin.mockResolvedValue({ user: { id: 9 } });

    render(<OAuthCallbackPage code="authorization-code" provider="oidc" state="oauth-state" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Please wait while we finish signing you in.",
    );
    await waitFor(() =>
      expect(completeOAuthLogin).toHaveBeenCalledWith({
        code: "authorization-code",
        provider: "oidc",
        state: "oauth-state",
      }),
    );
    expect(completeOAuthLogin).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith({ to: "/", replace: true });
  });

  test("rejects an incomplete callback without calling the API", async () => {
    render(<OAuthCallbackPage provider="oidc" state="" />);

    expect(await screen.findByText("The OAuth callback is incomplete or invalid.")).toBeVisible();
    expect(completeOAuthLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  test("returns an OAuth login to the protected console deep link", async () => {
    completeOAuthLogin.mockResolvedValue({ user: { id: 9 } });
    rememberOAuthRedirect("oauth-return-state", "/console/models?detail=openai%2Fgpt-5");

    render(
      <OAuthCallbackPage code="authorization-code" provider="oidc" state="oauth-return-state" />,
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        href: "/console/models?detail=openai%2Fgpt-5",
        replace: true,
      }),
    );
  });
});
