import type {
  ConsoleSession,
  EmailVerificationInput,
  EVMWalletAuthBeginInput,
  EVMWalletAuthChallenge,
  EVMWalletAuthCompleteInput,
  OAuthCallbackInput,
  OAuthLoginFlow,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
  SignInInput,
  SignInResult,
  VerifyTwoFactorLoginInput,
} from "./contracts";
import { asRecord, LiveDataContractError, readString, requireNumber } from "./live-contract";
import { liveApiClient as client } from "./live-repository-runtime";
import { mapLiveEVMWalletChallenge, mapLiveSessionBundle } from "./live-session-mappers";
import type { ConsoleAuthActionRepository } from "./session-repository";
import { buildAssertionCredential, prepareCredentialRequestOptions } from "@/lib/webauthn";

export const liveAuthRepository: ConsoleAuthActionRepository = {
  async createOAuthLoginFlow(provider: string): Promise<OAuthLoginFlow> {
    const response = await client.request<unknown>({
      path: "/api/oauth/state",
      method: "POST",
      body: { provider, intent: "login", client: "console_v2" },
      authenticated: false,
    });
    const flow = asRecord(response.data);
    const flowToken = readString(flow, "flow_token");
    const redirectUri = readString(flow, "redirect_uri");
    if (!flowToken || !redirectUri) {
      throw new Error("The server did not return a valid OAuth flow.");
    }
    return { flowToken, redirectUri };
  },
  async completeOAuthLogin(input: OAuthCallbackInput): Promise<ConsoleSession> {
    if (!input.provider) throw new LiveDataContractError("oauth.provider");
    const search = new URLSearchParams({ state: input.state });
    if (input.code) search.set("code", input.code);
    if (input.error) search.set("error", input.error);
    if (input.errorDescription) search.set("error_description", input.errorDescription);
    const response = await client.request<unknown>({
      path: `/api/oauth/${encodeURIComponent(input.provider)}?${search.toString()}`,
      authenticated: false,
    });
    return mapLiveSessionBundle(response.data);
  },
  async register(input: RegisterInput) {
    const search = new URLSearchParams();
    if (input.turnstileToken) search.set("turnstile", input.turnstileToken);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    await client.request({
      path: `/api/user/register${suffix}`,
      method: "POST",
      body: {
        username: input.username,
        password: input.password,
        email: input.email,
        verification_code: input.verificationCode,
        aff_code: input.affiliateCode,
      },
      authenticated: false,
    });
  },
  async sendEmailVerification(input: EmailVerificationInput) {
    const search = new URLSearchParams({ email: input.email });
    if (input.turnstileToken) search.set("turnstile", input.turnstileToken);
    await client.request({
      path: `/api/verification?${search.toString()}`,
      authenticated: false,
    });
  },
  async requestPasswordReset(input: PasswordResetRequestInput) {
    const search = new URLSearchParams({
      email: input.email,
      redirect_path: "/console/user/reset",
    });
    if (input.turnstileToken) search.set("turnstile", input.turnstileToken);
    await client.request({
      path: `/api/reset_password?${search.toString()}`,
      authenticated: false,
    });
  },
  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const response = await client.request<string>({
      path: "/api/user/reset",
      method: "POST",
      body: input,
      authenticated: false,
    });
    if (typeof response.data !== "string" || !response.data) {
      throw new Error("The server did not return a new password.");
    }
    return response.data;
  },
  async signIn(input: SignInInput): Promise<SignInResult> {
    const response = await client.request<unknown>({
      path: "/api/user/login",
      method: "POST",
      body: { username: input.username, password: input.password },
      headers: input.turnstileToken ? { "X-Turnstile-Token": input.turnstileToken } : undefined,
      authenticated: false,
    });
    const payload = asRecord(response.data);
    if (payload.require_2fa !== undefined && typeof payload.require_2fa !== "boolean") {
      throw new LiveDataContractError("login.require_2fa");
    }
    if (payload.require_2fa === true) {
      const flowToken = readString(payload, "flow_token");
      if (!flowToken) throw new Error("The two-factor login flow is invalid.");
      return {
        kind: "two_factor",
        flowToken,
        expiresAt: requireNumber(payload, "expires_at", "two_factor.expires_at"),
      };
    }
    return {
      kind: "authenticated",
      session: mapLiveSessionBundle(response.data),
    };
  },
  async verifyTwoFactorLogin(input: VerifyTwoFactorLoginInput) {
    const response = await client.request<unknown>({
      path: "/api/user/login/2fa",
      method: "POST",
      body: { code: input.code, flow_token: input.flowToken },
      authenticated: false,
    });
    return mapLiveSessionBundle(response.data);
  },
  async signInWithPasskey() {
    if (typeof navigator.credentials?.get !== "function") {
      throw new Error("Passkey is not available in this browser.");
    }
    const begin = await client.request<unknown>({
      path: "/api/user/passkey/login/begin",
      method: "POST",
      authenticated: false,
    });
    const beginData = asRecord(begin.data);
    const flowToken = readString(beginData, "flow_token");
    if (!flowToken) throw new Error("The Passkey login flow is invalid.");
    const credential = (await navigator.credentials.get({
      publicKey: prepareCredentialRequestOptions(beginData.options ?? begin.data),
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const finish = await client.request<unknown>({
      path: "/api/user/passkey/login/finish",
      method: "POST",
      body: {
        flow_token: flowToken,
        credential: buildAssertionCredential(credential),
      },
      authenticated: false,
    });
    return mapLiveSessionBundle(finish.data);
  },
  async beginEVMWalletAuth(input: EVMWalletAuthBeginInput): Promise<EVMWalletAuthChallenge> {
    const begin = await client.request<unknown>({
      path: `/api/user/evm-wallet/${input.intent}/begin`,
      method: "POST",
      body: {
        address: input.address,
        chain_id: String(input.chainId),
        affiliate_code: input.affiliateCode,
      },
      headers: input.turnstileToken ? { "X-Turnstile-Token": input.turnstileToken } : undefined,
      authenticated: false,
    });
    return mapLiveEVMWalletChallenge(begin.data);
  },
  async completeEVMWalletAuth(input: EVMWalletAuthCompleteInput) {
    const finish = await client.request<unknown>({
      path: "/api/user/evm-wallet/login/finish",
      method: "POST",
      body: { flow_token: input.flowToken, signature: input.signature },
      authenticated: false,
    });
    return mapLiveSessionBundle(finish.data);
  },
};
