import type { OAuthLoginFlow, OAuthProvider } from "@/data/contracts";

export function buildOAuthAuthorizationUrl(provider: OAuthProvider, flow: OAuthLoginFlow): string {
  const authorizationUrl = new URL(provider.authorizationEndpoint);
  if (authorizationUrl.protocol !== "https:" && authorizationUrl.protocol !== "http:") {
    throw new Error("The OAuth authorization endpoint is invalid.");
  }
  const redirectUrl = new URL(flow.redirectUri);
  if (redirectUrl.protocol !== "https:" && redirectUrl.protocol !== "http:") {
    throw new Error("The OAuth callback URL is invalid.");
  }
  authorizationUrl.searchParams.set("client_id", provider.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUrl.toString());
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("state", flow.flowToken);
  if (provider.scopes.trim()) authorizationUrl.searchParams.set("scope", provider.scopes.trim());
  return authorizationUrl.toString();
}
