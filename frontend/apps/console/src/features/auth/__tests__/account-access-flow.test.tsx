import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ForgotPasswordPage } from "../pages/forgot-password-page";
import { RegisterPage } from "../pages/register-page";
import { ResetPasswordPage } from "../pages/reset-password-page";
import type { AuthCapabilities } from "@/data/contracts";

const {
  confirmPasswordReset,
  navigate,
  register,
  requestPasswordReset,
  retryCapabilities,
  sendEmailVerification,
  sessionState,
} = vi.hoisted(() => ({
  confirmPasswordReset: vi.fn(),
  navigate: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  retryCapabilities: vi.fn(),
  sendEmailVerification: vi.fn(),
  sessionState: {
    capabilities: {
      oauthProviders: [],
      emailVerificationEnabled: false,
      evmWalletEnabled: false,
      evmWalletRegistrationEnabled: false,
      passkeyEnabled: false,
      passwordEnabled: true,
      registrationEnabled: true,
      turnstileEnabled: false,
      turnstileSiteKey: "",
    } as AuthCapabilities | null,
    capabilitiesLoading: false,
    capabilitiesRetrying: false,
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
    t: (key: string, values?: { seconds?: number }) =>
      values?.seconds === undefined ? key : key.replace("{{seconds}}", String(values.seconds)),
  }),
}));
vi.mock("@/app/session/session-context", () => ({
  useSession: () => ({
    ...sessionState,
    confirmPasswordReset,
    register,
    requestPasswordReset,
    retryCapabilities,
    sendEmailVerification,
  }),
}));

beforeEach(() => {
  confirmPasswordReset.mockReset();
  navigate.mockReset();
  register.mockReset();
  requestPasswordReset.mockReset();
  retryCapabilities.mockReset();
  sendEmailVerification.mockReset();
  sessionState.capabilities = {
    emailVerificationEnabled: false,
    evmWalletEnabled: false,
    evmWalletRegistrationEnabled: false,
    oauthProviders: [],
    passkeyEnabled: false,
    passwordEnabled: true,
    registrationEnabled: true,
    turnstileEnabled: false,
    turnstileSiteKey: "",
  };
  sessionState.capabilitiesLoading = false;
  sessionState.capabilitiesRetrying = false;
});

describe("User Console account access", () => {
  test("uses a compact two-column layout for password registration", () => {
    render(<RegisterPage />);

    const form = screen.getByRole("button", { name: "Create account" }).closest("form");
    expect(form?.querySelector('[data-slot="field-group"]')).toHaveClass("sm:grid-cols-2");
    expect(screen.getByRole("button", { name: "Create account" })).toHaveClass("sm:col-span-2");
  });

  test("creates a password account using the existing registration contract", async () => {
    register.mockResolvedValue(undefined);
    render(<RegisterPage affiliateCode="partner-code" redirectTo="/console/getting-started" />);

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "new-user" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secure-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "secure-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        affiliateCode: "partner-code",
        email: "new@example.com",
        password: "secure-password",
        turnstileToken: undefined,
        username: "new-user",
        verificationCode: undefined,
      }),
    );
    expect(navigate).toHaveBeenCalledWith({
      to: "/sign-in",
      replace: true,
      search: { redirect: "/console/getting-started" },
    });
  });

  test("shows an enumeration-safe confirmation after requesting a reset email", async () => {
    requestPasswordReset.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "member@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));

    expect(await screen.findByText("Check your inbox")).toBeVisible();
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "member@example.com",
      turnstileToken: undefined,
    });
    expect(
      screen.getByText(
        "If an account matches this email, a reset link has been sent. The same message is shown for unknown emails.",
      ),
    ).toBeVisible();
  });

  test("reveals the generated password only after a valid reset confirmation", async () => {
    confirmPasswordReset.mockResolvedValue("Generated#2026");
    render(<ResetPasswordPage email="member@example.com" token="reset-token" />);

    fireEvent.click(screen.getByRole("button", { name: "Confirm password reset" }));

    expect(await screen.findByDisplayValue("Generated#2026")).toBeVisible();
    expect(confirmPasswordReset).toHaveBeenCalledWith({
      email: "member@example.com",
      token: "reset-token",
    });
    expect(screen.getByText("Password reset complete")).toBeVisible();
  });

  test("offers an in-place retry when registration settings cannot be loaded", () => {
    sessionState.capabilities = null;
    render(<RegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retryCapabilities).toHaveBeenCalledOnce();
    expect(screen.getByText("Authentication service unavailable")).toBeVisible();
  });
});
