import { ApiClientError } from "@token-boat/api-client";

import type { AuthCapabilities, OAuthProvider } from "./contracts";
import {
  asRecord,
  LiveDataContractError,
  readOptionalBoolean,
  readOptionalItems,
  readString,
  requireBoolean,
  requireString,
} from "./live-contract";
import {
  clearLiveSession,
  getLiveSession,
  liveApiClient as client,
} from "./live-repository-runtime";
import { mapLiveSessionBundle } from "./live-session-mappers";
import type { ConsoleAuthActionRepository, ConsoleSessionRepository } from "./session-repository";

function loadLiveAuthRepository(): Promise<ConsoleAuthActionRepository> {
  return import("./live-auth-repository").then((module) => module.liveAuthRepository);
}

function mapOAuthProviders(status: Record<string, unknown>): OAuthProvider[] {
  const providers: OAuthProvider[] = [];
  if (requireBoolean(status, "github_oauth", "status.github_oauth")) {
    providers.push({
      id: "github",
      name: "GitHub",
      clientId: requireString(status, "github_client_id", "status.github_client_id"),
      authorizationEndpoint: "https://github.com/login/oauth/authorize",
      scopes: "user:email",
      kind: "github",
    });
  }
  if (requireBoolean(status, "discord_oauth", "status.discord_oauth")) {
    providers.push({
      id: "discord",
      name: "Discord",
      clientId: requireString(status, "discord_client_id", "status.discord_client_id"),
      authorizationEndpoint: "https://discord.com/oauth2/authorize",
      scopes: "identify openid",
      kind: "discord",
    });
  }
  if (requireBoolean(status, "oidc_enabled", "status.oidc_enabled")) {
    providers.push({
      id: "oidc",
      name: readString(status, "oidc_display_name", "OIDC"),
      clientId: requireString(status, "oidc_client_id", "status.oidc_client_id"),
      authorizationEndpoint: requireString(
        status,
        "oidc_authorization_endpoint",
        "status.oidc_authorization_endpoint",
      ),
      scopes: "openid profile email",
      kind: "oidc",
    });
  }
  if (requireBoolean(status, "linuxdo_oauth", "status.linuxdo_oauth")) {
    providers.push({
      id: "linuxdo",
      name: "Linux DO",
      clientId: requireString(status, "linuxdo_client_id", "status.linuxdo_client_id"),
      authorizationEndpoint: "https://connect.linux.do/oauth2/authorize",
      scopes: "",
      kind: "linuxdo",
    });
  }
  for (const value of readOptionalItems(
    status.custom_oauth_providers,
    "status.custom_oauth_providers",
  )) {
    const provider = asRecord(value);
    const id = requireString(provider, "slug", "status.custom_oauth_providers[].slug");
    providers.push({
      id,
      name: readString(provider, "name", id),
      clientId: requireString(
        provider,
        "client_id",
        `status.custom_oauth_providers.${id}.client_id`,
      ),
      authorizationEndpoint: requireString(
        provider,
        "authorization_endpoint",
        `status.custom_oauth_providers.${id}.authorization_endpoint`,
      ),
      scopes: readString(provider, "scopes"),
      kind: "custom",
    });
  }
  return providers;
}

export const liveSessionRepository: ConsoleSessionRepository = {
  mode: "live",
  async getAuthCapabilities(): Promise<AuthCapabilities> {
    const response = await client.request<unknown>({
      path: "/api/status",
      authenticated: false,
    });
    const status = asRecord(response.data);
    const turnstileEnabled = requireBoolean(status, "turnstile_check", "status.turnstile_check");
    const turnstileSiteKey = readString(status, "turnstile_site_key");
    if (turnstileEnabled && !turnstileSiteKey) {
      throw new LiveDataContractError("status.turnstile_site_key");
    }
    return {
      emailVerificationEnabled: requireBoolean(
        status,
        "email_verification",
        "status.email_verification",
      ),
      evmWalletEnabled: readOptionalBoolean(status, "evm_wallet_auth_enabled") === true,
      evmWalletRegistrationEnabled:
        readOptionalBoolean(status, "evm_wallet_auth_enabled") === true &&
        requireBoolean(status, "register_enabled", "status.register_enabled"),
      oauthProviders: mapOAuthProviders(status),
      passkeyEnabled: requireBoolean(status, "passkey_login", "status.passkey_login"),
      passwordEnabled: requireBoolean(
        status,
        "password_login_enabled",
        "status.password_login_enabled",
      ),
      registrationEnabled:
        requireBoolean(status, "register_enabled", "status.register_enabled") &&
        requireBoolean(status, "password_register_enabled", "status.password_register_enabled"),
      turnstileEnabled,
      turnstileSiteKey,
    };
  },
  async getSession(options) {
    try {
      const currentSession = getLiveSession();
      const response = await client.request<unknown>({
        path: "/api/user/auth/refresh",
        method: "POST",
        authenticated: false,
        signal: options?.signal,
        headers:
          !options?.ignoreCurrentSession && currentSession?.sessionId
            ? { "X-Auth-Session": currentSession.sessionId }
            : undefined,
      });
      return mapLiveSessionBundle(response.data);
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
        clearLiveSession();
        return null;
      }
      throw error;
    }
  },
  createOAuthLoginFlow: async (...args) =>
    (await loadLiveAuthRepository()).createOAuthLoginFlow(...args),
  completeOAuthLogin: async (...args) =>
    (await loadLiveAuthRepository()).completeOAuthLogin(...args),
  register: async (...args) => (await loadLiveAuthRepository()).register(...args),
  sendEmailVerification: async (...args) =>
    (await loadLiveAuthRepository()).sendEmailVerification(...args),
  requestPasswordReset: async (...args) =>
    (await loadLiveAuthRepository()).requestPasswordReset(...args),
  confirmPasswordReset: async (...args) =>
    (await loadLiveAuthRepository()).confirmPasswordReset(...args),
  signIn: async (...args) => (await loadLiveAuthRepository()).signIn(...args),
  verifyTwoFactorLogin: async (...args) =>
    (await loadLiveAuthRepository()).verifyTwoFactorLogin(...args),
  signInWithPasskey: async (...args) => (await loadLiveAuthRepository()).signInWithPasskey(...args),
  beginEVMWalletAuth: async (...args) =>
    (await loadLiveAuthRepository()).beginEVMWalletAuth(...args),
  completeEVMWalletAuth: async (...args) =>
    (await loadLiveAuthRepository()).completeEVMWalletAuth(...args),
  clearLocalSession: clearLiveSession,
  async signOut(session) {
    await client.request({
      path: "/api/user/auth/logout",
      method: "POST",
      headers: session?.sessionId ? { "X-Auth-Session": session.sessionId } : undefined,
    });
    clearLiveSession();
  },
};
