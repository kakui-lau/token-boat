import { ApiClientError } from "@token-boat/api-client";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import type { DateRangeValue } from "../contracts";
import { liveRepository } from "../live-repository";
import { liveSessionRepository } from "../live-session-repository";
import { server } from "@/test/server";

const range: DateRangeValue = {
  preset: "custom",
  from: "2026-08-01",
  to: "2026-08-07",
};

describe("live repository contracts", () => {
  test("maps the selectable API key groups returned for the current account", async () => {
    server.use(
      http.get("*/api/user/self/groups", () =>
        HttpResponse.json({
          success: true,
          data: {
            priority: { desc: "Priority routing", ratio: 2 },
            default: { desc: "Default routing", ratio: 1 },
          },
        }),
      ),
    );

    await expect(liveRepository.listApiKeyGroups()).resolves.toEqual([
      { value: "default", description: "Default routing", ratio: 1 },
      { value: "priority", description: "Priority routing", ratio: 2 },
    ]);
  });

  test("returns signed out only for an authentication failure", async () => {
    server.use(
      http.post("*/api/user/auth/refresh", () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_UNAUTHORIZED",
            message: "Unauthorized",
          },
          { status: 401 },
        ),
      ),
    );

    await expect(liveRepository.getSession()).resolves.toBeNull();
  });

  test("preserves the session state when the API is unavailable", async () => {
    server.use(
      http.post("*/api/user/auth/refresh", () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_INTERNAL_ERROR",
            message: "Service Unavailable",
          },
          { status: 503 },
        ),
      ),
    );

    await expect(liveRepository.getSession()).rejects.toMatchObject({
      status: 503,
      code: "AUTH_INTERNAL_ERROR",
    } satisfies Partial<ApiClientError>);
  });

  test("can refresh a session from a newer cross-tab cookie without sending a stale session ID", async () => {
    const sessionHeaders: Array<string | null> = [];
    server.use(
      http.post("*/api/user/auth/refresh", ({ request }) => {
        sessionHeaders.push(request.headers.get("X-Auth-Session"));
        const sessionId = sessionHeaders.length === 1 ? "session-a" : "session-b";
        return HttpResponse.json({
          success: true,
          data: {
            ...authBundle("merchant"),
            session: { sid: sessionId },
          },
        });
      }),
    );

    await liveRepository.getSession({ ignoreCurrentSession: true });
    await liveRepository.getSession();
    await liveRepository.getSession({ ignoreCurrentSession: true });

    expect(sessionHeaders).toEqual([null, "session-a", null]);
  });

  test("shares refreshed credentials with business repository requests", async () => {
    let authorizationHeader: string | null = null;
    server.use(
      http.post("*/api/user/auth/refresh", () =>
        HttpResponse.json({
          success: true,
          data: authBundle("merchant"),
        }),
      ),
      http.get("*/api/user/self/groups", ({ request }) => {
        authorizationHeader = request.headers.get("Authorization");
        return HttpResponse.json({
          success: true,
          data: { default: { desc: "Default routing", ratio: 1 } },
        });
      }),
    );

    try {
      await liveSessionRepository.getSession({ ignoreCurrentSession: true });
      await liveRepository.listApiKeyGroups();
      expect(authorizationHeader).toBe("Bearer access-token");
    } finally {
      liveSessionRepository.clearLocalSession();
    }
  });

  test("maps the backend usage summary and converts quota to USD", async () => {
    server.use(
      http.get("*/api/log/self/usage", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("start_timestamp")).toBe("1785513600");
        expect(url.searchParams.get("end_timestamp")).toBe("1786118399");
        expect(url.searchParams.get("timezone_offset_minutes")).toBe(
          String(-new Date().getTimezoneOffset()),
        );
        return HttpResponse.json({
          success: true,
          data: {
            quota: 125_000,
            request_count: 20,
            failure_count: 5,
            total_tokens: 3_000,
            average_latency_ms: 625.5,
            series: [
              {
                day_start: 1_785_513_600,
                request_count: 8,
                failure_count: 2,
                total_tokens: 1_250,
                quota: 50_000,
              },
            ],
            models: [
              {
                model_name: "image-capable-chat-model",
                request_count: 16,
                failure_count: 4,
                total_tokens: 2_400,
                quota: 100_000,
              },
            ],
            api_keys: [
              {
                token_id: 9,
                token_name: "Production key",
                request_count: 18,
                failure_count: 2,
                total_tokens: 2_700,
                quota: 110_000,
              },
            ],
          },
        });
      }),
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                request_id: "req-contract-1",
                type: 2,
                model_name: "image-capable-chat-model",
                created_at: 1_754_000_000,
                other: JSON.stringify({ request_path: "/v1/chat/completions" }),
              },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const usage = await liveRepository.getUsage(range);

    expect(usage).toMatchObject({
      totalRequests: 25,
      totalTokens: 3_000,
      totalCost: 0.25,
      averageLatencyMs: 625.5,
      successRate: 80,
      series: [{ date: "2026-08-01", requests: 10, tokens: 1_250, cost: 0.1 }],
      models: [
        {
          model: "image-capable-chat-model",
          requests: 20,
          tokens: 2_400,
          cost: 0.2,
          successRate: 80,
        },
      ],
      apiKeys: [
        {
          apiKeyId: 9,
          apiKeyName: "Production key",
          requests: 20,
          tokens: 2_700,
          cost: 0.22,
          successRate: 90,
        },
      ],
      recentRequests: [
        {
          id: "req-contract-1",
          event: "chat",
          model: "image-capable-chat-model",
          status: "succeeded",
        },
      ],
    });
  });

  test("loads a request detail by its exact account-scoped request ID", async () => {
    server.use(
      http.get("*/api/log/self/detail/:requestId", ({ params }) => {
        expect(params.requestId).toBe("req-detail-1");
        return HttpResponse.json({
          success: true,
          data: {
            request_id: "req-detail-1",
            upstream_request_id: "service-trace-1",
            type: 2,
            model_name: "gpt-5",
            token_name: "Production key",
            ip: "203.0.113.8",
            created_at: 1_785_513_600,
            prompt_tokens: 20,
            completion_tokens: 10,
            quota: 25,
            other: JSON.stringify({
              request_path: "/v1/chat/completions",
              response_time_ms: 184,
              status_code: 200,
            }),
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(liveRepository.getRequestLog("req-detail-1")).resolves.toMatchObject({
      id: "req-detail-1",
      serviceTraceId: "service-trace-1",
      sourceIp: "203.0.113.8",
      endpoint: "/v1/chat/completions",
      latencyMs: 184,
      cost: 0.00005,
    });
  });

  test("only reports a reachable integration environment after reaching the public status API", async () => {
    const statusRequest = vi.fn();
    server.use(
      http.get("*/api/status", () => {
        statusRequest();
        return HttpResponse.json({ success: true, data: { status: true } });
      }),
    );

    const integration = await liveRepository.getIntegration();

    expect(statusRequest).toHaveBeenCalledOnce();
    expect(integration).toMatchObject({
      baseUrl: `${window.location.origin}/v1`,
      serviceStatus: "reachable",
    });
  });

  test("maps group sales prices and tiered media prices into the model catalog", async () => {
    server.use(
      http.get("*/api/user/models", ({ request }) => {
        expect(new URL(request.url).searchParams.get("group")).toBe("priority group");
        return HttpResponse.json({
          success: true,
          data: ["anthropic/claude-fable-5", "bytedance/seedance-2.0"],
        });
      }),
      http.get("*/api/pricing", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_name: "anthropic/claude-fable-5",
              vendor_id: 2,
              owner_by: "",
              context_length: 200_000,
              max_output_tokens: 32_000,
              limits_source_url: "https://vendor.example/models/claude-fable-5",
              limits_verified_at: 1_788_192_000,
              description: "Production reasoning model",
              tags: "文本,推理,代码",
              supported_endpoint_types: ["openai", "anthropic"],
              pricing_source: "sales_price_book",
              availability_status: "available",
              available: true,
              sales_prices_by_group: {
                "priority group": {
                  currency: "USD",
                  billing_mode: "token",
                  price_structure: "flat",
                  items: [
                    {
                      component: "token_input",
                      amount: "9.95233",
                      base_amount: "10",
                      unit: "token",
                      unit_size: "1000000",
                      applied_group_label: "Priority",
                    },
                    {
                      component: "token_output",
                      amount: "49.76163",
                      unit: "token",
                      unit_size: "1000000",
                      applied_group_label: "Priority",
                    },
                    {
                      component: "cache_read",
                      amount: "0.99524",
                      unit: "token",
                      unit_size: "1000000",
                      applied_group_label: "Priority",
                    },
                    {
                      component: "cache_write",
                      amount: "12.44041",
                      unit: "token",
                      unit_size: "1000000",
                      applied_group_label: "Priority",
                    },
                  ],
                },
              },
              official_price: {
                currency: "USD",
                billing_mode: "token",
                price_structure: "flat",
                items: [
                  {
                    component: "token_input",
                    amount: "10",
                    unit: "token",
                    unit_size: "1000000",
                  },
                  {
                    component: "token_output",
                    amount: "50",
                    unit: "token",
                    unit_size: "1000000",
                  },
                  {
                    component: "cache_read",
                    amount: "1",
                    unit: "token",
                    unit_size: "1000000",
                  },
                  {
                    component: "cache_write",
                    amount: "12.5",
                    unit: "token",
                    unit_size: "1000000",
                  },
                ],
              },
              lowest_price: {
                currency: "USD",
                billing_mode: "token",
                price_structure: "flat",
                items: [
                  { component: "token_input", amount: "10", unit: "token" },
                  { component: "token_output", amount: "50", unit: "token" },
                ],
              },
            },
            {
              model_name: "bytedance/seedance-2.0",
              vendor_id: 16,
              owner_by: "",
              tags: "视频,文生视频",
              available: true,
              sales_prices_by_group: {
                "priority group": {
                  currency: "USD",
                  billing_mode: "video_duration",
                  price_structure: "tiered",
                  items: [
                    {
                      component: "video_output",
                      amount: "0.06803",
                      unit: "second",
                      unit_size: "1",
                      tier: "480p",
                    },
                    {
                      component: "video_output",
                      amount: "0.35958",
                      unit: "second",
                      unit_size: "1",
                      tier: "1080p",
                    },
                  ],
                },
              },
            },
          ],
          vendors: [
            { id: 2, name: "Anthropic", icon: "Claude.Color" },
            { id: 16, name: "ByteDance", icon: "ByteDance" },
          ],
        }),
      ),
    );

    await expect(liveRepository.listModelCatalog("priority group")).resolves.toEqual([
      expect.objectContaining({
        id: "anthropic/claude-fable-5",
        provider: "Anthropic",
        contextWindow: 200_000,
        maxOutputTokens: 32_000,
        limitsSourceUrl: "https://vendor.example/models/claude-fable-5",
        limitsVerifiedAt: 1_788_192_000,
        description: "Production reasoning model",
        family: "reasoning",
        inputPrice: 9.95233,
        inputPriceQualifier: null,
        outputPrice: 49.76163,
        outputPriceQualifier: null,
        currency: "USD",
        inputPriceUnit: "million_tokens",
        outputPriceUnit: "million_tokens",
        pricingAvailable: true,
        pricingSource: "sales_price_book",
        accountPriceSource: "group",
        accountPrice: expect.objectContaining({
          billingMode: "token",
          priceStructure: "flat",
          items: [
            expect.objectContaining({
              component: "token_input",
              amount: 9.95233,
              baseAmount: 10,
              unitSize: 1_000_000,
              appliedGroupLabel: "Priority",
            }),
            expect.objectContaining({
              component: "token_output",
              amount: 49.76163,
            }),
            expect.objectContaining({
              component: "cache_read",
              amount: 0.99524,
            }),
            expect.objectContaining({
              component: "cache_write",
              amount: 12.44041,
            }),
          ],
        }),
        officialPrice: expect.objectContaining({
          items: [
            expect.objectContaining({ component: "token_input", amount: 10 }),
            expect.objectContaining({ component: "token_output", amount: 50 }),
            expect.objectContaining({ component: "cache_read", amount: 1 }),
            expect.objectContaining({ component: "cache_write", amount: 12.5 }),
          ],
        }),
        features: ["文本", "推理", "代码"],
        availabilityStatus: "available",
        supportedEndpointTypes: ["openai", "anthropic"],
      }),
      expect.objectContaining({
        id: "bytedance/seedance-2.0",
        provider: "ByteDance",
        family: "video",
        inputPrice: null,
        outputPrice: 0.06803,
        outputPriceQualifier: "from",
        currency: "USD",
        inputPriceUnit: null,
        outputPriceUnit: "second",
        pricingAvailable: true,
        accountPriceSource: "group",
        accountPrice: expect.objectContaining({
          billingMode: "video_duration",
          priceStructure: "tiered",
          items: [
            expect.objectContaining({ amount: 0.06803, tier: "480p" }),
            expect.objectContaining({ amount: 0.35958, tier: "1080p" }),
          ],
        }),
      }),
    ]);
  });

  test("keeps unpriced model metadata explicitly unavailable", async () => {
    server.use(
      http.get("*/api/user/models", () =>
        HttpResponse.json({
          success: true,
          data: ["vendor/model-without-price"],
        }),
      ),
      http.get("*/api/pricing", () => HttpResponse.json({ success: true, data: [] })),
    );

    await expect(liveRepository.listModelCatalog("default")).resolves.toEqual([
      expect.objectContaining({
        id: "vendor/model-without-price",
        provider: null,
        family: "unknown",
        currency: null,
        inputPriceUnit: null,
        outputPriceUnit: null,
        pricingAvailable: false,
      }),
    ]);
  });

  test("maps available password, Passkey, and standard or custom OAuth sign-in methods", async () => {
    server.use(
      http.get("*/api/status", () =>
        HttpResponse.json({
          success: true,
          data: {
            email_verification: true,
            evm_wallet_auth_enabled: true,
            github_oauth: true,
            github_client_id: "github-client",
            discord_oauth: false,
            linuxdo_oauth: false,
            oidc_enabled: true,
            oidc_client_id: "oidc-client",
            oidc_authorization_endpoint: "https://identity.example.com/authorize",
            oidc_display_name: "Company SSO",
            custom_oauth_providers: [
              {
                slug: "partner-sso",
                name: "Partner SSO",
                client_id: "partner-client",
                authorization_endpoint: "https://partner.example.com/oauth/authorize",
                scopes: "openid profile",
              },
            ],
            passkey_login: true,
            password_login_enabled: false,
            password_register_enabled: true,
            register_enabled: true,
            turnstile_check: true,
            turnstile_site_key: "turnstile-site-key",
          },
        }),
      ),
    );

    await expect(liveRepository.getAuthCapabilities()).resolves.toEqual({
      emailVerificationEnabled: true,
      evmWalletEnabled: true,
      evmWalletRegistrationEnabled: true,
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
          id: "oidc",
          name: "Company SSO",
          clientId: "oidc-client",
          authorizationEndpoint: "https://identity.example.com/authorize",
          scopes: "openid profile email",
          kind: "oidc",
        },
        {
          id: "partner-sso",
          name: "Partner SSO",
          clientId: "partner-client",
          authorizationEndpoint: "https://partner.example.com/oauth/authorize",
          scopes: "openid profile",
          kind: "custom",
        },
      ],
      passkeyEnabled: true,
      passwordEnabled: false,
      registrationEnabled: true,
      turnstileEnabled: true,
      turnstileSiteKey: "turnstile-site-key",
    });
  });

  test("binds the console callback to OAuth state and completes the login bundle", async () => {
    server.use(
      http.post("*/api/oauth/state", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          provider: "oidc",
          intent: "login",
          client: "console_v2",
        });
        return HttpResponse.json({
          success: true,
          data: {
            flow_token: "oauth-flow-token",
            redirect_uri: "https://dashboard.example.com/console/oauth/oidc",
          },
        });
      }),
      http.get("*/api/oauth/oidc", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("state")).toBe("oauth-flow-token");
        expect(search.get("code")).toBe("authorization-code");
        return HttpResponse.json({
          success: true,
          data: authBundle("oauth-user"),
        });
      }),
    );

    await expect(liveRepository.createOAuthLoginFlow("oidc")).resolves.toEqual({
      flowToken: "oauth-flow-token",
      redirectUri: "https://dashboard.example.com/console/oauth/oidc",
    });
    await expect(
      liveRepository.completeOAuthLogin({
        provider: "oidc",
        state: "oauth-flow-token",
        code: "authorization-code",
      }),
    ).resolves.toMatchObject({ user: { username: "oauth-user" } });
  });

  test("uses the public registration and password recovery contracts", async () => {
    server.use(
      http.post("*/api/user/register", async ({ request }) => {
        expect(new URL(request.url).searchParams.get("turnstile")).toBe("human-token");
        await expect(request.json()).resolves.toEqual({
          username: "new-user",
          password: "secure-password",
          email: "new@example.com",
          verification_code: "123456",
          aff_code: "partner-code",
        });
        return HttpResponse.json({ success: true });
      }),
      http.get("*/api/verification", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("email")).toBe("new@example.com");
        expect(search.get("turnstile")).toBe("human-token");
        return HttpResponse.json({ success: true });
      }),
      http.get("*/api/reset_password", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("email")).toBe("new@example.com");
        expect(search.get("redirect_path")).toBe("/console/user/reset");
        expect(search.get("turnstile")).toBe("human-token");
        return HttpResponse.json({ success: true });
      }),
      http.post("*/api/user/reset", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          email: "new@example.com",
          token: "reset-token",
        });
        return HttpResponse.json({ success: true, data: "Generated#2026" });
      }),
    );

    await expect(
      liveRepository.register({
        affiliateCode: "partner-code",
        email: "new@example.com",
        password: "secure-password",
        turnstileToken: "human-token",
        username: "new-user",
        verificationCode: "123456",
      }),
    ).resolves.toBeUndefined();
    await expect(
      liveRepository.sendEmailVerification({
        email: "new@example.com",
        turnstileToken: "human-token",
      }),
    ).resolves.toBeUndefined();
    await expect(
      liveRepository.requestPasswordReset({
        email: "new@example.com",
        turnstileToken: "human-token",
      }),
    ).resolves.toBeUndefined();
    await expect(
      liveRepository.confirmPasswordReset({
        email: "new@example.com",
        token: "reset-token",
      }),
    ).resolves.toBe("Generated#2026");
  });

  test("continues a password login through the two-factor flow token", async () => {
    server.use(
      http.post("*/api/user/login", async ({ request }) => {
        expect(request.headers.get("X-Turnstile-Token")).toBe("human-token");
        await expect(request.json()).resolves.toEqual({
          username: "secured-user",
          password: "correct-password",
        });
        return HttpResponse.json({
          success: true,
          data: {
            require_2fa: true,
            flow_token: "two-factor-flow",
            expires_at: 1_800_000_000,
          },
        });
      }),
      http.post("*/api/user/login/2fa", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          code: "123456",
          flow_token: "two-factor-flow",
        });
        return HttpResponse.json({
          success: true,
          data: authBundle("secured-user"),
        });
      }),
    );

    const result = await liveRepository.signIn({
      username: "secured-user",
      password: "correct-password",
      turnstileToken: "human-token",
    });
    expect(result).toEqual({
      kind: "two_factor",
      flowToken: "two-factor-flow",
      expiresAt: 1_800_000_000,
    });
    if (result.kind !== "two_factor") throw new Error("Expected a two-factor challenge");
    await expect(
      liveRepository.verifyTwoFactorLogin({
        code: "123456",
        flowToken: result.flowToken,
      }),
    ).resolves.toMatchObject({ user: { username: "secured-user" } });
  });

  test("completes a discoverable Passkey login with the browser credential", async () => {
    const originalCredentials = Object.getOwnPropertyDescriptor(navigator, "credentials");
    const getCredential = vi.fn().mockResolvedValue({
      id: "credential-id",
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        authenticatorData: new Uint8Array([4]).buffer,
        clientDataJSON: new Uint8Array([5]).buffer,
        signature: new Uint8Array([6]).buffer,
        userHandle: new Uint8Array([7]).buffer,
      },
      getClientExtensionResults: () => ({}),
    });
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { get: getCredential },
    });
    server.use(
      http.post("*/api/user/passkey/login/begin", () =>
        HttpResponse.json({
          success: true,
          data: {
            flow_token: "passkey-flow",
            options: { challenge: "AQID", allowCredentials: [] },
          },
        }),
      ),
      http.post("*/api/user/passkey/login/finish", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.flow_token).toBe("passkey-flow");
        expect(body.credential).toMatchObject({
          id: "credential-id",
          type: "public-key",
        });
        return HttpResponse.json({
          success: true,
          data: authBundle("passkey-user"),
        });
      }),
    );

    try {
      await expect(liveRepository.signInWithPasskey()).resolves.toMatchObject({
        user: { username: "passkey-user" },
      });
      expect(getCredential).toHaveBeenCalledWith({
        publicKey: expect.objectContaining({
          challenge: expect.any(ArrayBuffer),
        }),
      });
    } finally {
      if (originalCredentials) {
        Object.defineProperty(navigator, "credentials", originalCredentials);
      } else {
        Reflect.deleteProperty(navigator, "credentials");
      }
    }
  });

  test("binds an EVM wallet signature to the server-issued SIWE challenge", async () => {
    const address = "0x52908400098527886E0F7030069857D2E4169EE7";
    const signature = `0x${"ab".repeat(65)}`;
    server.use(
      http.post("*/api/user/evm-wallet/register/begin", async ({ request }) => {
        expect(new URL(request.url).search).toBe("");
        expect(request.headers.get("X-Turnstile-Token")).toBe("human-token");
        await expect(request.json()).resolves.toEqual({
          address,
          affiliate_code: "partner-code",
          chain_id: "1",
        });
        return HttpResponse.json({
          success: true,
          data: {
            address,
            chain_id: "1",
            expires_at: 1_800_000_000,
            flow_token: "evm-flow",
            message: "server-issued SIWE message",
            nonce: "Nonce12345678",
          },
        });
      }),
      http.post("*/api/user/evm-wallet/login/finish", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          flow_token: "evm-flow",
          signature,
        });
        return HttpResponse.json({ success: true, data: authBundle("evm-user", true) });
      }),
    );

    await expect(
      liveRepository.beginEVMWalletAuth({
        address,
        affiliateCode: "partner-code",
        chainId: 1,
        intent: "register",
        turnstileToken: "human-token",
      }),
    ).resolves.toEqual({
      address,
      chainId: 1,
      expiresAt: 1_800_000_000,
      flowToken: "evm-flow",
      message: "server-issued SIWE message",
      nonce: "Nonce12345678",
    });
    await expect(
      liveRepository.completeEVMWalletAuth({ flowToken: "evm-flow", signature }),
    ).resolves.toMatchObject({
      user: { username: "evm-user", usernameEditable: true },
    });
  });

  test("binds an EVM wallet to an existing account with a session-bound security proof", async () => {
    server.use(
      http.post("*/api/user/auth/refresh", () =>
        HttpResponse.json({ success: true, data: authBundle("merchant-owner") }),
      ),
    );
    await liveRepository.getSession({ ignoreCurrentSession: true });
    useDefaultAccountHandlers({});
    const address = "0x52908400098527886E0F7030069857D2E4169EE7";
    const signature = `0x${"cd".repeat(65)}`;
    server.use(
      http.post("*/api/verify", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          method: "password",
          scope: "evm_wallet.bind",
          code: "current-password",
        });
        return HttpResponse.json({ success: true, data: { proof_token: "wallet-proof" } });
      }),
      http.post("*/api/user/evm-wallet/bind/begin", async ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("wallet-proof");
        await expect(request.json()).resolves.toEqual({ address, chain_id: "1" });
        return HttpResponse.json({
          success: true,
          data: {
            address,
            chain_id: "1",
            expires_at: 1_800_000_000,
            flow_token: "wallet-bind-flow",
            message: "server-issued SIWE message",
            nonce: "Nonce12345678",
          },
        });
      }),
      http.post("*/api/user/evm-wallet/bind/finish", async ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("wallet-proof");
        await expect(request.json()).resolves.toEqual({
          flow_token: "wallet-bind-flow",
          signature,
        });
        return HttpResponse.json({ success: true, data: authBundle("merchant-owner") });
      }),
    );

    const proof = await liveRepository.createEVMWalletSecurityProof(
      "password",
      "evm_wallet.bind",
      "current-password",
    );
    const challenge = await liveRepository.beginEVMWalletBinding({
      address,
      chainId: 1,
      proof,
    });
    await expect(
      liveRepository.completeEVMWalletBinding({
        flowToken: challenge.flowToken,
        signature,
        proof,
      }),
    ).resolves.toMatchObject({ account: { security: { evmWalletEnabled: false } } });
  });

  test("sets the first password through a purpose-bound EVM wallet challenge", async () => {
    await authenticateLiveRepository();
    useDefaultAccountHandlers({});
    const address = "0x52908400098527886E0F7030069857D2E4169EE7";
    const signature = `0x${"ef".repeat(65)}`;
    server.use(
      http.post("*/api/user/evm-wallet/password/begin", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({ address, chain_id: "1" });
        return HttpResponse.json({
          success: true,
          data: {
            address,
            chain_id: "1",
            expires_at: 1_800_000_000,
            flow_token: "wallet-password-flow",
            message: "server-issued password setup message",
            nonce: "Nonce12345678",
          },
        });
      }),
      http.post("*/api/user/evm-wallet/password/finish", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          flow_token: "wallet-password-flow",
          signature,
          password: "new-wallet-password",
        });
        return HttpResponse.json({ success: true, data: authBundle("merchant-owner") });
      }),
    );

    await expect(
      liveRepository.beginEVMWalletPasswordSetup({ address, chainId: 1 }),
    ).resolves.toMatchObject({ flowToken: "wallet-password-flow", address, chainId: 1 });
    await expect(
      liveRepository.completeEVMWalletPasswordSetup({
        flowToken: "wallet-password-flow",
        signature,
        newPassword: "new-wallet-password",
      }),
    ).resolves.toMatchObject({ account: { user: { passwordSet: true } } });
  });

  test("maps paginated API keys without exposing the stored secret", async () => {
    server.use(
      http.get("*/api/token/", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 100,
            total: 1,
            items: [
              {
                id: 7,
                name: "Production app",
                key: "prod**********cdef",
                status: 1,
                created_time: 1_754_000_000,
                accessed_time: 1_754_000_100,
                expired_time: -1,
                remain_quota: 500_000,
                used_quota: 100_000,
                unlimited_quota: false,
                group: "default",
                model_limits: "gpt-5,text-embedding-3-large",
                allow_ips: "192.0.2.1,2001:db8::/32",
              },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(liveRepository.listApiKeys()).resolves.toEqual([
      expect.objectContaining({
        id: 7,
        name: "Production app",
        maskedKey: "sk-prod••••••••cdef",
        remainingQuotaUsd: 1,
        usedQuotaUsd: 0.2,
        allowedModels: ["gpt-5", "text-embedding-3-large"],
        allowedIps: ["192.0.2.1", "2001:db8::/32"],
      }),
    ]);
  });

  test("treats an explicit null IP allowlist as unrestricted", async () => {
    server.use(
      http.get("*/api/token/", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 100,
            total: 1,
            items: [
              {
                id: 8,
                name: "Legacy key",
                key: "lega**********cdef",
                status: 1,
                created_time: 1_754_000_000,
                accessed_time: 0,
                expired_time: -1,
                remain_quota: 0,
                used_quota: 0,
                unlimited_quota: true,
                group: "default",
                model_limits: "",
                allow_ips: null,
              },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(liveRepository.listApiKeys()).resolves.toEqual([
      expect.objectContaining({ id: 8, allowedIps: [] }),
    ]);
  });

  test("forwards API key pagination filters and preserves server totals", async () => {
    server.use(
      http.get("*/api/token/search", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("p")).toBe("2");
        expect(search.get("page_size")).toBe("20");
        expect(search.get("keyword")).toBe("%worker%");
        expect(search.get("status")).toBe("2");
        expect(search.get("order")).toBe("asc");
        return HttpResponse.json({
          success: true,
          data: { page: 2, page_size: 20, total: 44, items: [] },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getApiKeysPage({
        keyword: "worker",
        order: "asc",
        page: 2,
        pageSize: 20,
        status: "disabled",
      }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 20, total: 44 });
  });

  test("forwards request-log range, field, status, sorting, and pagination", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("p")).toBe("3");
        expect(search.get("page_size")).toBe("10");
        expect(search.get("request_id")).toBe("req-42");
        expect(search.get("type")).toBe("5");
        expect(search.get("scope")).toBe("request");
        expect(search.get("order")).toBe("asc");
        expect(search.get("start_timestamp")).toBe("1785513600");
        expect(search.get("end_timestamp")).toBe("1786118399");
        return HttpResponse.json({
          success: true,
          data: { page: 3, page_size: 10, total: 21, items: [] },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getRequestLogsPage({
        keyword: "req-42",
        order: "asc",
        page: 3,
        pageSize: 10,
        range,
        searchField: "request",
        status: "failed",
      }),
    ).resolves.toEqual({ items: [], page: 3, pageSize: 10, total: 21 });
  });

  test("maps filtered request-log statistics without deriving them from the current page", async () => {
    server.use(
      http.get("*/api/log/self/usage", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("model_name")).toBe("%gpt-5%");
        expect(search.get("bucket_seconds")).toBe("3600");
        expect(search.get("start_timestamp")).toBe("1785513600");
        expect(search.get("end_timestamp")).toBe("1786118399");
        return HttpResponse.json({
          success: true,
          data: {
            quota: 125_000,
            request_count: 8,
            failure_count: 2,
            failure_rate: 0.2,
            peak_rpm: 4,
            peak_tpm: 1_250,
            total_tokens: 3_000,
            cache_hit_tokens: 300,
            cache_hit_rate: 0.125,
            series: [
              {
                day_start: 1_785_513_600,
                bucket_seconds: 3_600,
                request_count: 8,
                failure_count: 2,
                total_tokens: 3_000,
                cache_hit_tokens: 300,
                cache_hit_rate: 0.125,
                quota: 125_000,
              },
            ],
            models: [],
            api_keys: [],
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const analytics = await liveRepository.getRequestLogAnalytics({
      keyword: "gpt-5",
      range,
      searchField: "model",
      status: "all",
    });

    expect(analytics).toMatchObject({
      requestCount: 10,
      failureCount: 2,
      failureRate: 20,
      peakRpm: 4,
      peakTpm: 1_250,
      totalTokens: 3_000,
      totalCost: 0.25,
      cacheHitTokens: 300,
      cacheHitRate: 12.5,
    });
    expect(analytics.series[0]).toMatchObject({
      bucketStart: 1_785_513_600,
      succeeded: 8,
      failed: 2,
      rpm: 10 / 60,
      tpm: 50,
      cost: 0.25,
      cacheHitRate: 12.5,
    });
  });

  test("excludes account activity records and never invents an API endpoint", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        expect(new URL(request.url).searchParams.get("scope")).toBe("request");
        return HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 2,
            items: [
              {
                request_id: "login-audit",
                type: 7,
                content: "Logged in successfully via password",
              },
              {
                request_id: "api-request",
                type: 2,
                created_at: 1_754_000_000,
                model_name: "gpt-5",
                prompt_tokens: 10,
                completion_tokens: 20,
                quota: 100,
                other: "null",
              },
            ],
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const result = await liveRepository.getRequestLogsPage({
      keyword: "",
      order: "desc",
      page: 1,
      pageSize: 20,
      range,
      searchField: "request",
      status: "all",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "api-request",
      endpoint: null,
    });
  });

  test("loads sign-in activity from the dedicated activity scope without inventing request data", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("scope")).toBe("activity");
        expect(search.get("type")).toBe("7");
        expect(search.get("order")).toBe("asc");
        return HttpResponse.json({
          success: true,
          data: {
            page: 2,
            page_size: 10,
            total: 11,
            items: [
              {
                id: 11,
                request_id: "activity-login-11",
                type: 7,
                created_at: 1_787_979_512,
                content: "Logged in successfully via passkey",
                ip: "203.0.113.9",
                other: JSON.stringify({
                  login_method: "passkey",
                  user_agent: "Contract browser",
                  op: { action: "login", params: { method: "passkey" } },
                }),
              },
            ],
          },
        });
      }),
    );

    await expect(
      liveRepository.getAccountActivityPage({
        order: "asc",
        page: 2,
        pageSize: 10,
        range,
        type: "login",
      }),
    ).resolves.toEqual({
      page: 2,
      pageSize: 10,
      total: 11,
      items: [
        {
          id: "activity-login-11",
          eventId: "activity-login-11",
          type: "login",
          createdAt: 1_787_979_512,
          content: "Logged in successfully via passkey",
          action: "login",
          parameters: { method: "passkey" },
          sourceIp: "203.0.113.9",
          loginMethod: "passkey",
          userAgent: "Contract browser",
        },
      ],
    });
  });

  test("treats a null activity metadata payload as missing optional observability data", async () => {
    server.use(
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 1,
            items: [
              {
                id: 12,
                type: 4,
                created_at: 1_787_979_600,
                content: "Two-factor setup started",
                other: "null",
              },
            ],
          },
        }),
      ),
    );

    await expect(
      liveRepository.getAccountActivityPage({
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        type: "all",
      }),
    ).resolves.toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: "12",
          eventId: null,
          type: "system",
          createdAt: 1_787_979_600,
          content: "Two-factor setup started",
          action: null,
          parameters: null,
          sourceIp: null,
          loginMethod: null,
          userAgent: null,
        },
      ],
    });
  });

  test("rejects request logs returned by the account activity contract", async () => {
    server.use(
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 1,
            items: [
              {
                id: 1,
                request_id: "wrong-scope",
                type: 2,
                created_at: 1_787_979_512,
              },
            ],
          },
        }),
      ),
    );

    await expect(
      liveRepository.getAccountActivityPage({
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        type: "all",
      }),
    ).rejects.toThrow("account_activity.type");
  });

  test("loads credits and refunds from the dedicated billing scope without inventing top-up amounts", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("scope")).toBe("billing");
        expect(search.has("type")).toBe(false);
        expect(search.get("order")).toBe("asc");
        return HttpResponse.json({
          success: true,
          data: {
            page: 2,
            page_size: 10,
            total: 12,
            items: [
              {
                id: 21,
                type: 1,
                created_at: 1_787_979_000,
                content: "Account recharge completed",
                ip: "203.0.113.24",
                quota: 0,
              },
              {
                id: 22,
                request_id: "billing-refund-22",
                task_id: "task-video-22",
                type: 6,
                created_at: 1_787_979_512,
                content: "Unused task reservation returned",
                model_name: "seedance-2.0",
                token_name: "Production app",
                quota: 12_500,
              },
            ],
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getBillingLedgerPage({
        order: "asc",
        page: 2,
        pageSize: 10,
        range,
        type: "all",
      }),
    ).resolves.toEqual({
      page: 2,
      pageSize: 10,
      total: 12,
      items: [
        {
          id: "21",
          eventId: null,
          type: "topup",
          createdAt: 1_787_979_000,
          content: "Account recharge completed",
          sourceIp: "203.0.113.24",
          amountUsd: null,
          model: null,
          apiKeyName: null,
          taskId: null,
        },
        {
          id: "billing-refund-22",
          eventId: "billing-refund-22",
          type: "refund",
          createdAt: 1_787_979_512,
          content: "Unused task reservation returned",
          sourceIp: null,
          amountUsd: 0.025,
          model: "seedance-2.0",
          apiKeyName: "Production app",
          taskId: "task-video-22",
        },
      ],
    });
  });

  test("rejects request records returned by the billing ledger contract", async () => {
    server.use(
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 1,
            items: [{ id: 1, request_id: "wrong-billing-scope", type: 2 }],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getBillingLedgerPage({
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        type: "all",
      }),
    ).rejects.toThrow("billing_ledger.type");
  });

  test("forwards an explicit refund filter to the billing log scope", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("scope")).toBe("billing");
        expect(search.get("type")).toBe("6");
        return HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 20, total: 0, items: [] },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getBillingLedgerPage({
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        type: "refund",
      }),
    ).resolves.toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  test("searches the public service trace ID through the compatible backend parameter", async () => {
    server.use(
      http.get("*/api/log/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("upstream_request_id")).toBe("trace-service-42");
        expect(search.has("request_id")).toBe(false);
        return HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 20, total: 0, items: [] },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getRequestLogsPage({
        keyword: "trace-service-42",
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        searchField: "service_trace",
        status: "all",
      }),
    ).resolves.toEqual({ items: [], page: 1, pageSize: 20, total: 0 });
  });

  test("maps the log use-time seconds and quota into request latency and USD cost", async () => {
    server.use(
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 1,
            items: [
              {
                request_id: "req-timed",
                upstream_request_id: "upstream-request-42",
                ip: "203.0.113.24",
                model_name: "gpt-5",
                token_name: "Model test",
                created_at: 1_787_979_512,
                type: 2,
                prompt_tokens: 11,
                completion_tokens: 4,
                use_time: 3,
                is_stream: true,
                group: "priority",
                quota: 680,
                other: JSON.stringify({
                  billing_mode: "tiered_expr",
                  billing_source: "balance",
                  billing_stage: "completed",
                  actual_pre_consumed_quota: 750,
                  adjustment_quota: -70,
                  audio_input: 3,
                  audio_output: 4,
                  billing_preference: "subscription_first",
                  cache_creation_tokens: 6,
                  cache_creation_tokens_1h: 4,
                  cache_creation_tokens_5m: 2,
                  cache_write_tokens: 6,
                  cache_tokens: 5,
                  customer_final_quota: 680,
                  error_type: "rate_limit_error",
                  frt: 420,
                  image_output: 7,
                  input_tokens_total: 18,
                  is_model_mapped: true,
                  is_system_prompt_overwritten: true,
                  matched_tier: "standard",
                  local_estimated_quota: 600,
                  outstanding_quota: 20,
                  quota_per_unit: 500_000,
                  reasoning_effort: "high",
                  request_conversion: ["OpenAI Compatible", "Gemini"],
                  request_path: "/v1/chat/completions",
                  stream_status: {
                    status: "completed",
                    end_reason: "length",
                    error_count: 0,
                  },
                  subscription_consumed: 680,
                  subscription_plan_title: "Developer Pro",
                  subscription_remain: 9_320,
                  task_action: "generate",
                  task_duration_sec: 12,
                  task_failure_reason: "generation failed",
                  task_id: "task-public-42",
                  task_platform: "video",
                  task_status: "FAILURE",
                  text_input: 11,
                  text_output: 4,
                  tool_surcharges: [{ name: "web_search", count: 2, price: 10 }],
                  usage_count_source: "normalized_usage",
                  usage_semantic: "anthropic",
                  upstream_model_name: "gemini-2.5-pro",
                }),
              },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getRequestLogsPage({
        keyword: "",
        order: "desc",
        page: 1,
        pageSize: 20,
        range,
        searchField: "request",
        status: "all",
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: "req-timed",
          serviceTraceId: "upstream-request-42",
          sourceIp: "203.0.113.24",
          group: "priority",
          isStream: true,
          latencyMs: 3_000,
          firstTokenLatencyMs: 420,
          cost: 0.00136,
          quotaPerUnit: 500_000,
          cacheReadTokens: 5,
          cacheWriteTokens: 6,
          cacheWrite5mTokens: 2,
          cacheWrite1hTokens: 4,
          inputTokensTotal: 18,
          imageTokens: 7,
          audioInputTokens: 3,
          audioOutputTokens: 4,
          textInputTokens: 11,
          textOutputTokens: 4,
          toolSurcharges: [{ name: "web_search", count: 2, unitPrice: 10, totalCost: 0.02 }],
          billingMode: "tiered_expr",
          billingSource: "balance",
          billingStage: "completed",
          billingTier: "standard",
          estimatedCost: 0.0012,
          preConsumedCost: 0.0015,
          finalCost: 0.00136,
          adjustmentCost: -0.00014,
          outstandingCost: 0.00004,
          billingPreference: "subscription_first",
          subscriptionPlanTitle: "Developer Pro",
          subscriptionConsumedCost: 0.00136,
          subscriptionRemainingCost: 0.01864,
          usageCountSource: "normalized_usage",
          usageSemantic: "anthropic",
          requestPolicyApplied: true,
          task: {
            id: "task-public-42",
            platform: "video",
            action: "generate",
            status: "FAILURE",
            durationMs: 12_000,
            refundedCost: null,
            failureReason: "generation failed",
            refundReason: null,
          },
          reasoningEffort: "high",
          streamStatus: {
            status: "completed",
            endReason: "length",
            errorCount: 0,
            endError: null,
            errors: [],
          },
        },
      ],
    });
  });

  test("forwards task product type and grouped status to the server", async () => {
    server.use(
      http.get("*/api/task/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("task_type")).toBe("video");
        expect(search.get("status_group")).toBe("processing");
        expect(search.get("order")).toBe("desc");
        return HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 12, total: 8, items: [] },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.getTasksPage({
        order: "desc",
        page: 1,
        pageSize: 12,
        range,
        status: "processing",
        type: "video",
      }),
    ).resolves.toEqual({ items: [], page: 1, pageSize: 12, total: 8 });
  });

  test("loads all task tab counts in one server request", async () => {
    server.use(
      http.get("*/api/task/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("include_type_counts")).toBe("true");
        expect(search.get("status_group")).toBe("succeeded");
        return HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 1,
            total: 12,
            items: [],
            type_counts: { all: 12, image: 5, video: 4, audio: 3 },
          },
        });
      }),
    );

    await expect(
      liveRepository.getTaskTypeCounts({
        order: "desc",
        range,
        status: "succeeded",
      }),
    ).resolves.toEqual({ all: 12, image: 5, video: 4, audio: 3 });
  });

  test("forwards billing transaction filters without loading a fixed first page", async () => {
    server.use(
      http.get("*/api/user/topup/self", ({ request }) => {
        const search = new URL(request.url).searchParams;
        expect(search.get("p")).toBe("2");
        expect(search.get("page_size")).toBe("50");
        expect(search.get("keyword")).toBe("%order-7%");
        expect(search.get("status")).toBe("success");
        expect(search.get("order_type")).toBe("subscription");
        expect(search.get("order")).toBe("asc");
        return HttpResponse.json({
          success: true,
          data: { page: 2, page_size: 50, total: 61, items: [] },
        });
      }),
    );

    await expect(
      liveRepository.getBillingTransactionsPage({
        keyword: "order-7",
        order: "asc",
        page: 2,
        pageSize: 50,
        range,
        status: "completed",
        type: "subscription",
      }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 50, total: 61 });
  });

  test("creates an API key and exposes the full secret once with its client prefix", async () => {
    server.use(
      http.post("*/api/token/", async ({ request }) => {
        await expect(request.json()).resolves.toMatchObject({
          name: "Staging worker",
          remain_quota: 750_000,
          model_limits_enabled: true,
          model_limits: "gpt-5",
          allow_ips: "192.0.2.5",
          group: "default",
          expired_time: 1_800_000_000,
        });
        return HttpResponse.json({
          success: true,
          data: {
            id: 9,
            name: "Staging worker",
            key: "full-secret-value",
            status: 1,
            created_time: 1_754_000_000,
            accessed_time: 1_754_000_000,
            expired_time: 1_800_000_000,
            remain_quota: 750_000,
            used_quota: 0,
            unlimited_quota: false,
            group: "default",
            model_limits: "gpt-5",
            allow_ips: "192.0.2.5",
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const created = await liveRepository.createApiKey({
      name: "Staging worker",
      expiresAt: 1_800_000_000,
      unlimitedQuota: false,
      quotaUsd: 1.5,
      group: "default",
      environment: "staging",
      allowedModels: ["gpt-5"],
      allowedIps: ["192.0.2.5"],
    });

    expect(created.secret).toBe("sk-full-secret-value");
    expect(created.record).toMatchObject({
      id: 9,
      name: "Staging worker",
      remainingQuotaUsd: 1.5,
      status: "active",
    });
  });

  test("updates an API key without requesting or returning the full secret", async () => {
    server.use(
      http.put("*/api/token/", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          id: 9,
          name: "Production gateway",
          expired_time: 1_764_000_000,
          remain_quota: 7500,
          unlimited_quota: false,
          model_limits_enabled: true,
          model_limits: "gpt-5,claude-sonnet-4",
          allow_ips: "203.0.113.0/24",
          group: "default",
          auto_groups: [],
          cross_group_retry: false,
        });
        return HttpResponse.json({
          success: true,
          data: {
            id: 9,
            name: "Production gateway",
            key: "full**********alue",
            status: 1,
            created_time: 1_754_000_000,
            accessed_time: 1_754_086_400,
            expired_time: 1_764_000_000,
            remain_quota: 7500,
            used_quota: 2500,
            unlimited_quota: false,
            group: "default",
            model_limits_enabled: true,
            model_limits: "gpt-5,claude-sonnet-4",
            allow_ips: "203.0.113.0/24",
          },
        });
      }),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(
      liveRepository.updateApiKey({
        id: 9,
        name: "Production gateway",
        expiresAt: 1_764_000_000,
        unlimitedQuota: false,
        remainingQuotaUsd: 0.015,
        group: "default",
        environment: "production",
        allowedModels: ["gpt-5", "claude-sonnet-4"],
        allowedIps: ["203.0.113.0/24"],
      }),
    ).resolves.toMatchObject({
      id: 9,
      name: "Production gateway",
      maskedKey: "sk-full••••••••alue",
      remainingQuotaUsd: 0.015,
      usedQuotaUsd: 0.005,
    });
  });

  test("rejects a positive API key quota that is smaller than one raw quota unit", async () => {
    let createRequests = 0;
    server.use(
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
      http.post("*/api/token/", () => {
        createRequests += 1;
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    await expect(
      liveRepository.createApiKey({
        name: "Too small",
        expiresAt: null,
        unlimitedQuota: false,
        quotaUsd: 0.000_000_1,
        group: "default",
        environment: "development",
        allowedModels: [],
        allowedIps: [],
      }),
    ).rejects.toThrow("api_key.quota_usd");
    expect(createRequests).toBe(0);
  });

  test("converts fixed recharge package quota units into credited USD", async () => {
    server.use(
      http.get("*/api/user/topup/info", () =>
        HttpResponse.json({
          success: true,
          data: {
            min_topup: 1,
            stripe_min_topup: 1,
            waffo_min_topup: 1,
            waffo_pancake_min_topup: 1,
            enable_online_topup: false,
            enable_stripe_topup: false,
            enable_waffo_topup: false,
            enable_waffo_pancake_topup: false,
            enable_creem_topup: true,
            pay_methods: [],
            waffo_pay_methods: [],
            creem_products: [
              {
                name: "Starter pack",
                productId: "starter-pack",
                price: 10,
                quota: 500_000,
                currency: "USD",
              },
            ],
            discount: {},
            amount_options: [10],
            payment_compliance_confirmed: true,
            enable_redemption: true,
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({
          success: true,
          data: {
            quota_display_type: "USD",
            quota_per_unit: 500_000,
            usd_exchange_rate: 7,
          },
        }),
      ),
    );

    await expect(liveRepository.getRechargeConfiguration()).resolves.toMatchObject({
      products: [{ creditUsd: 1, id: "starter-pack" }],
    });
  });

  test("loads persisted notification settings and security status from the account APIs", async () => {
    server.use(
      http.get("*/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: accountUser(),
        }),
      ),
      http.get("*/api/user/setting", () =>
        HttpResponse.json({
          success: true,
          data: {
            notify_type: "webhook",
            quota_warning_threshold: 1_000_000,
            webhook_url: "https://merchant.example.com/hooks/quota",
            webhook_secret_configured: true,
            gotify_priority: 5,
            gotify_token_configured: false,
            notification_email: "owner@example.com",
            record_ip_forced: false,
            record_ip_log: false,
          },
        }),
      ),
      http.get("*/api/user/sessions", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              sid: "session-current",
              current: true,
              login_method: "passkey",
              ip: "192.0.2.8",
              user_agent: "Chrome on macOS",
              created_at: 1_753_900_000,
              last_active_at: 1_754_000_000,
              expires_at: 1_756_500_000,
            },
          ],
        }),
      ),
      http.get("*/api/user/passkey", () =>
        HttpResponse.json({
          success: true,
          data: { enabled: true, last_used_at: "2026-08-28T08:00:00Z" },
        }),
      ),
      http.get("*/api/user/2fa/status", () =>
        HttpResponse.json({
          success: true,
          data: { enabled: true, locked: false, backup_codes_remaining: 6 },
        }),
      ),
      http.get("*/api/user/evm-wallet", () =>
        HttpResponse.json({
          success: true,
          data: {
            enabled: true,
            address: "0x0000000000000000000000000000000000000001",
            last_used_at: 1_787_904_000,
            removable: true,
            verification_method: "2fa",
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const account = await liveRepository.getAccount();

    expect(account.preferences).toMatchObject({
      balanceWarningThresholdUsd: 2,
      notificationEmail: "owner@example.com",
      notifyType: "webhook",
      recordIpForced: false,
      recordIpLog: false,
      webhookSecret: "",
      webhookSecretConfigured: true,
      webhookUrl: "https://merchant.example.com/hooks/quota",
    });
    expect(account.security).toMatchObject({
      backupCodesRemaining: 6,
      emailBound: true,
      passkeyEnabled: true,
      passkeyLastUsedAt: 1_787_904_000,
      twoFactorEnabled: true,
      twoFactorLocked: false,
    });
    expect(account.sessions).toEqual([
      expect.objectContaining({
        id: "session-current",
        current: true,
        method: "passkey",
        createdAt: 1_753_900_000,
        expiresAt: 1_756_500_000,
      }),
    ]);
  });

  test("revokes every other browser session through the existing account endpoint", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.post("*/api/user/sessions/revoke-others", () =>
        HttpResponse.json({ success: true, data: { revoked_count: 3 } }),
      ),
    );

    await expect(liveRepository.revokeOtherSessions()).resolves.toMatchObject({
      revokedCount: 3,
      account: { sessions: [] },
    });
  });

  test("updates profile and verified email through the self profile contract", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.put("*/api/user/self", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          username: "merchant-owner",
          display_name: "Merchant Renamed",
          email: "verified@example.com",
          verification_code: "123456",
        });
        return HttpResponse.json({ success: true, data: null });
      }),
    );

    await expect(
      liveRepository.updateProfile({
        username: "merchant-owner",
        displayName: "Merchant Renamed",
        email: "verified@example.com",
        verificationCode: "123456",
      }),
    ).resolves.toMatchObject({ user: { username: "merchant-owner" } });
  });

  test("does not replace the server default balance threshold with a fabricated USD value", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.get("*/api/user/setting", () =>
        HttpResponse.json({
          success: true,
          data: {
            notify_type: "email",
            quota_warning_threshold: 0,
            gotify_priority: 5,
            gotify_token_configured: false,
            webhook_secret_configured: false,
            record_ip_forced: false,
            record_ip_log: false,
          },
        }),
      ),
    );

    await expect(liveRepository.getAccount()).resolves.toMatchObject({
      preferences: { balanceWarningThresholdUsd: null },
    });
  });

  test("keeps an empty notification channel unconfigured instead of rejecting the account", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.get("*/api/user/setting", () =>
        HttpResponse.json({
          success: true,
          data: {
            notify_type: "",
            quota_warning_threshold: 0,
            gotify_priority: 0,
            gotify_token_configured: false,
            webhook_secret_configured: false,
            record_ip_forced: false,
            record_ip_log: false,
          },
        }),
      ),
    );

    await expect(liveRepository.getAccount()).resolves.toMatchObject({
      preferences: {
        balanceWarningThresholdUsd: null,
        notifyType: null,
      },
    });
  });

  test("maps saved balance notifications and the configured platform monitors", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.get("*/api/uptime/status", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              categoryName: "Public API",
              monitors: [
                {
                  group: "Gateway",
                  name: "Chat API",
                  status: 1,
                  uptime: 0.9998,
                },
                {
                  group: "Workers",
                  name: "Video tasks",
                  status: 2,
                  uptime: 0.9875,
                },
              ],
            },
          ],
        }),
      ),
    );

    const alertCenter = await liveRepository.getAlertCenter();

    expect(alertCenter.rules).toEqual([
      expect.objectContaining({
        channel: "email",
        enabled: null,
        threshold: 1,
        type: "balance",
      }),
    ]);
    expect(alertCenter.platform).toEqual({
      configured: true,
      monitors: [
        {
          id: "0-0",
          group: "Gateway",
          name: "Chat API",
          status: "operational",
          uptimePercent: 99.98,
        },
        {
          id: "0-1",
          group: "Workers",
          name: "Video tasks",
          status: "degraded",
          uptimePercent: 98.75,
        },
      ],
      status: "degraded",
      uptimePercent: 98.75,
    });
  });

  test("keeps saved alert rules available when platform or security status endpoints fail", async () => {
    useDefaultAccountHandlers({});
    server.use(
      http.get("*/api/uptime/status", () =>
        HttpResponse.json({ success: false, message: "offline" }, { status: 503 }),
      ),
      http.get("*/api/user/sessions", () =>
        HttpResponse.json({ success: false, message: "unexpected request" }, { status: 500 }),
      ),
      http.get("*/api/user/passkey", () =>
        HttpResponse.json({ success: false, message: "unexpected request" }, { status: 500 }),
      ),
      http.get("*/api/user/2fa/status", () =>
        HttpResponse.json({ success: false, message: "unexpected request" }, { status: 500 }),
      ),
    );

    await expect(liveRepository.getAlertCenter()).resolves.toMatchObject({
      platform: {
        configured: null,
        monitors: [],
        status: "unknown",
        uptimePercent: null,
      },
      rules: [
        {
          id: "balance-warning",
          type: "balance",
          channel: "email",
          enabled: null,
        },
      ],
    });
  });

  test("saves a canonical USD threshold with the backend quota unit", async () => {
    server.use(
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
      http.put("*/api/user/setting", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          bark_url: "",
          gotify_priority: 5,
          gotify_token: "",
          gotify_url: "",
          notification_email: "alerts@example.com",
          notify_type: "webhook",
          quota_warning_threshold: 750_000,
          record_ip_log: true,
          webhook_secret: "replacement-secret",
          webhook_url: "https://merchant.example.com/hooks/quota",
        });
        return HttpResponse.json({ success: true, data: null });
      }),
      http.get("*/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: accountUser(),
        }),
      ),
      http.get("*/api/user/setting", () =>
        HttpResponse.json({
          success: true,
          data: {
            notify_type: "webhook",
            quota_warning_threshold: 750_000,
            webhook_url: "https://merchant.example.com/hooks/quota",
            webhook_secret_configured: true,
            gotify_priority: 5,
            gotify_token_configured: false,
            notification_email: "alerts@example.com",
            record_ip_forced: true,
            record_ip_log: true,
          },
        }),
      ),
      http.get("*/api/user/sessions", () => HttpResponse.json({ success: true, data: [] })),
      http.get("*/api/user/passkey", () =>
        HttpResponse.json({ success: true, data: { enabled: false } }),
      ),
      http.get("*/api/user/2fa/status", () =>
        HttpResponse.json({
          success: true,
          data: { enabled: false, locked: false },
        }),
      ),
      http.get("*/api/user/evm-wallet", () =>
        HttpResponse.json({
          success: true,
          data: { enabled: false, verification_method: "password" },
        }),
      ),
    );

    const account = await liveRepository.updatePreferences({
      balanceWarningThresholdUsd: 1.5,
      barkUrl: "",
      gotifyPriority: 5,
      gotifyToken: "",
      gotifyTokenConfigured: false,
      gotifyUrl: "",
      notificationEmail: "alerts@example.com",
      notifyType: "webhook",
      recordIpForced: true,
      recordIpLog: false,
      webhookSecret: "replacement-secret",
      webhookSecretConfigured: true,
      webhookUrl: "https://merchant.example.com/hooks/quota",
    });

    expect(account.preferences.balanceWarningThresholdUsd).toBe(1.5);
    expect(account.preferences.webhookSecretConfigured).toBe(true);
  });

  test("sets up 2FA and accepts the rotated session after enablement", async () => {
    await authenticateLiveRepository();
    useDefaultAccountHandlers({ twoFactorEnabled: true });
    server.use(
      http.post("*/api/user/2fa/setup", () =>
        HttpResponse.json({
          success: true,
          data: {
            secret: "JBSWY3DPEHPK3PXP",
            qr_code_data: "otpauth://totp/TokenBoat:owner?secret=JBSWY3DPEHPK3PXP",
            backup_codes: ["RECOVERY-ONE", "RECOVERY-TWO"],
          },
        }),
      ),
      http.post("*/api/user/2fa/enable", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({ code: "123456" });
        return HttpResponse.json({
          success: true,
          data: {
            access_token: "access-after-2fa",
            access_expires_at: 1_900_000_000,
            session: { sid: "session-contract" },
          },
        });
      }),
    );

    await expect(liveRepository.setupTwoFactor()).resolves.toEqual({
      secret: "JBSWY3DPEHPK3PXP",
      qrCodeData: "otpauth://totp/TokenBoat:owner?secret=JBSWY3DPEHPK3PXP",
      backupCodes: ["RECOVERY-ONE", "RECOVERY-TWO"],
    });
    const result = await liveRepository.enableTwoFactor(" 123456 ");

    expect(result.session).toMatchObject({
      accessToken: "access-after-2fa",
      accessExpiresAt: 1_900_000_000,
      sessionId: "session-contract",
    });
    expect(result.account.security.twoFactorEnabled).toBe(true);
  });

  test("changes the password and accepts the rotated session", async () => {
    await authenticateLiveRepository();
    useDefaultAccountHandlers({});
    server.use(
      http.put("*/api/user/self", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          original_password: "current-password",
          password: "replacement-password",
        });
        return HttpResponse.json({
          success: true,
          data: {
            access_token: "access-after-password-change",
            access_expires_at: 1_900_000_000,
            session: { sid: "session-contract" },
          },
        });
      }),
    );

    const result = await liveRepository.changePassword({
      currentPassword: "current-password",
      newPassword: "replacement-password",
    });

    expect(result.session).toMatchObject({
      accessToken: "access-after-password-change",
      accessExpiresAt: 1_900_000_000,
      sessionId: "session-contract",
    });
    expect(result.account.user.username).toBe("merchant-owner");
  });

  test("registers a Passkey with 2FA proof and serializes the browser credential", async () => {
    await authenticateLiveRepository();
    useDefaultAccountHandlers({ passkeyEnabled: true });
    const originalCredentials = navigator.credentials;
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: vi.fn().mockResolvedValue({
          id: "credential-id",
          rawId: Uint8Array.from([1, 2, 3]).buffer,
          type: "public-key",
          authenticatorAttachment: "platform",
          response: {
            attestationObject: Uint8Array.from([4, 5, 6]).buffer,
            clientDataJSON: Uint8Array.from([7, 8, 9]).buffer,
            getTransports: () => ["internal"],
          },
          getClientExtensionResults: () => ({}),
        }),
        get: vi.fn(),
      },
    });
    server.use(
      http.post("*/api/verify", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          method: "2fa",
          scope: "passkey.register",
          code: "123456",
        });
        return HttpResponse.json({
          success: true,
          data: { proof_token: "proof-token" },
        });
      }),
      http.post("*/api/user/passkey/register/begin", ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("proof-token");
        return HttpResponse.json({
          success: true,
          data: {
            flow_token: "passkey-flow",
            options: {
              publicKey: {
                challenge: "AQID",
                rp: { id: "example.com", name: "Token Boat" },
                user: { id: "BAUG", name: "owner", displayName: "Owner" },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
              },
            },
          },
        });
      }),
      http.post("*/api/user/passkey/register/finish", async ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("proof-token");
        await expect(request.json()).resolves.toMatchObject({
          flow_token: "passkey-flow",
          credential: {
            id: "credential-id",
            rawId: "AQID",
            response: {
              attestationObject: "BAUG",
              clientDataJSON: "BwgJ",
              transports: ["internal"],
            },
          },
        });
        return HttpResponse.json({
          success: true,
          data: {
            access_token: "access-after-passkey",
            access_expires_at: 1_900_000_100,
            session: { sid: "session-contract" },
          },
        });
      }),
    );

    try {
      const result = await liveRepository.registerPasskey("123456");
      expect(result.session.accessToken).toBe("access-after-passkey");
      expect(result.account.security.passkeyEnabled).toBe(true);
    } finally {
      Object.defineProperty(navigator, "credentials", {
        configurable: true,
        value: originalCredentials,
      });
    }
  });

  test("removes a Passkey after browser assertion verification", async () => {
    await authenticateLiveRepository();
    useDefaultAccountHandlers({ passkeyEnabled: false });
    const originalCredentials = navigator.credentials;
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue({
          id: "credential-id",
          rawId: Uint8Array.from([1, 2, 3]).buffer,
          type: "public-key",
          authenticatorAttachment: "platform",
          response: {
            authenticatorData: Uint8Array.from([4, 5, 6]).buffer,
            clientDataJSON: Uint8Array.from([7, 8, 9]).buffer,
            signature: Uint8Array.from([10, 11, 12]).buffer,
            userHandle: Uint8Array.from([13, 14, 15]).buffer,
          },
          getClientExtensionResults: () => ({}),
        }),
      },
    });
    server.use(
      http.post("*/api/user/passkey/verify/begin", async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          scope: "passkey.delete",
        });
        return HttpResponse.json({
          success: true,
          data: {
            flow_token: "verification-flow",
            options: {
              publicKey: {
                challenge: "AQID",
                allowCredentials: [{ id: "BAUG", type: "public-key" }],
              },
            },
          },
        });
      }),
      http.post("*/api/user/passkey/verify/finish", async ({ request }) => {
        await expect(request.json()).resolves.toMatchObject({
          flow_token: "verification-flow",
          credential: {
            id: "credential-id",
            rawId: "AQID",
            response: {
              authenticatorData: "BAUG",
              clientDataJSON: "BwgJ",
              signature: "CgsM",
              userHandle: "DQ4P",
            },
          },
        });
        return HttpResponse.json({
          success: true,
          data: { proof_token: "passkey-proof" },
        });
      }),
      http.delete("*/api/user/passkey", ({ request }) => {
        expect(request.headers.get("X-Security-Proof")).toBe("passkey-proof");
        return HttpResponse.json({
          success: true,
          data: {
            access_token: "access-after-passkey-removal",
            access_expires_at: 1_900_000_200,
            session: { sid: "session-contract" },
          },
        });
      }),
    );

    try {
      const result = await liveRepository.removePasskey();
      expect(result.session.accessToken).toBe("access-after-passkey-removal");
      expect(result.account.security.passkeyEnabled).toBe(false);
    } finally {
      Object.defineProperty(navigator, "credentials", {
        configurable: true,
        value: originalCredentials,
      });
    }
  });

  test("maps subscription purchase methods, active state, and account purchase count", async () => {
    server.use(
      http.get("*/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: accountUser({ quota: 50_000_000, used_quota: 12_500_000 }),
        }),
      ),
      http.get("*/api/user/topup/self", () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
      http.get("*/api/subscription/plans", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              plan: {
                id: 4,
                title: "Business",
                subtitle: "Priority capacity",
                price_amount: 49,
                currency: "USD",
                duration_unit: "month",
                duration_value: 3,
                total_amount: 200_000_000,
                quota_reset_period: "monthly",
                allow_balance_pay: true,
                stripe_price_id: "price_business",
                creem_product_id: "creem_business",
                waffo_pancake_product_id: "pancake_business",
                max_purchase_per_user: 3,
              },
            },
          ],
        }),
      ),
      http.get("*/api/subscription/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            subscriptions: [{ subscription: { plan_id: 4, status: "active" } }],
            all_subscriptions: [
              { subscription: { plan_id: 4, status: "active" } },
              { subscription: { plan_id: 4, status: "expired" } },
            ],
          },
        }),
      ),
      http.get("*/api/user/topup/info", () =>
        HttpResponse.json({
          success: true,
          data: {
            enable_online_topup: true,
            enable_stripe_topup: true,
            enable_creem_topup: true,
            enable_waffo_pancake_topup: true,
            pay_methods: [
              { name: "Alipay", type: "alipay" },
              { name: "Stripe", type: "stripe" },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    const billing = await liveRepository.getBilling();

    expect(billing.balance).toBe(100);
    expect(billing.totalUsage).toBe(25);
    expect(billing.plans[0]).toMatchObject({
      current: true,
      durationValue: 3,
      purchaseCount: 2,
      purchaseLimit: 3,
      quotaUsd: 400,
      unlimitedQuota: false,
    });
    expect(billing.plans[0]?.paymentMethods.map((method) => method.type)).toEqual([
      "balance",
      "stripe",
      "creem",
      "waffo_pancake",
      "epay",
    ]);
  });

  test("creates an Epay subscription form with a tracked order and console return URL", async () => {
    server.use(
      http.post("*/api/subscription/epay/pay", async ({ request }) => {
        await expect(request.json()).resolves.toMatchObject({
          plan_id: 4,
          payment_method: "alipay",
          return_url: expect.stringMatching(/\/console\/recharge\?payment=pending$/),
        });
        return HttpResponse.json({
          message: "success",
          order_id: "SUBUSR12NO123",
          url: "https://pay.example.com/submit",
          data: { out_trade_no: "SUBUSR12NO123", sign: "signature" },
        });
      }),
    );

    await expect(
      liveRepository.purchaseSubscription({
        planId: 4,
        method: {
          id: "epay-alipay",
          name: "Alipay",
          type: "epay",
          paymentMethod: "alipay",
        },
      }),
    ).resolves.toEqual({
      kind: "form",
      orderId: "SUBUSR12NO123",
      url: "https://pay.example.com/submit",
      fields: { out_trade_no: "SUBUSR12NO123", sign: "signature" },
    });
  });

  test("confirms a returned top-up from the filtered billing history", async () => {
    server.use(
      http.get("*/api/user/topup/self", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("keyword")).toBe("ref_payment_1");
        return HttpResponse.json({
          success: true,
          data: { items: [{ trade_no: "ref_payment_1", status: "success" }] },
        });
      }),
    );

    await expect(
      liveRepository.getPaymentConfirmation({
        kind: "topup",
        orderId: "ref_payment_1",
      }),
    ).resolves.toBe("completed");
  });

  test("rejects an unknown payment state instead of reporting a failed order", async () => {
    server.use(
      http.get("*/api/user/topup/self", () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [{ trade_no: "ref_payment_unknown", status: "provider_review" }],
          },
        }),
      ),
    );

    await expect(
      liveRepository.getPaymentConfirmation({
        kind: "topup",
        orderId: "ref_payment_unknown",
      }),
    ).rejects.toThrow("billing_transaction.status");
  });

  test("keeps a real zero for the selected overview range instead of using all-time requests", async () => {
    server.use(
      http.get("*/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: accountUser({ request_count: 99 }),
        }),
      ),
      http.get("*/api/token/", () =>
        HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 100, total: 0, items: [] },
        }),
      ),
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 20, total: 0, items: [] },
        }),
      ),
      http.get("*/api/log/self/stat", () =>
        HttpResponse.json({
          success: true,
          data: {
            quota: 0,
            request_count: 0,
            failure_count: 0,
            total_tokens: 0,
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(liveRepository.getOverview(range)).resolves.toMatchObject({
      requestCount: 0,
      successRate: null,
    });
  });

  test("rejects financial conversion when the backend omits quota_per_unit", async () => {
    server.use(
      http.get("*/api/log/self/usage", () =>
        HttpResponse.json({
          success: true,
          data: {
            quota: 0,
            request_count: 0,
            failure_count: 0,
            total_tokens: 0,
            average_latency_ms: null,
            series: [],
            models: [],
            api_keys: [],
          },
        }),
      ),
      http.get("*/api/log/self", () =>
        HttpResponse.json({
          success: true,
          data: { page: 1, page_size: 20, total: 0, items: [] },
        }),
      ),
      http.get("*/api/status", () => HttpResponse.json({ success: true, data: {} })),
    );

    await expect(liveRepository.getUsage(range)).rejects.toThrow("status.quota_per_unit");
  });

  test("keeps missing Playground usage and cost explicitly unavailable", async () => {
    server.use(
      http.post("*/pg/chat/completions", () =>
        HttpResponse.json({
          id: "chatcmpl-no-usage",
          model: "gpt-5",
          choices: [{ message: { role: "assistant", content: "Hello" } }],
        }),
      ),
    );

    await expect(
      liveRepository.sendPlaygroundMessage({
        apiKeyId: 7,
        apiKeyName: "Test key",
        group: "default",
        model: "gpt-5",
        systemPrompt: "",
        messages: [{ role: "user", content: "Hi" }],
        temperature: 0.7,
        maxTokens: 128,
      }),
    ).resolves.toMatchObject({
      id: "chatcmpl-no-usage",
      inputTokens: null,
      outputTokens: null,
      estimatedCost: null,
    });
  });

  test("never builds a masked API secret from the database ID", async () => {
    server.use(
      http.get("*/api/token/", () =>
        HttpResponse.json({
          success: true,
          data: {
            page: 1,
            page_size: 100,
            total: 1,
            items: [
              {
                id: 42,
                name: "Broken contract",
                status: 1,
                created_time: 1_754_000_000,
                remain_quota: 0,
                used_quota: 0,
                unlimited_quota: false,
                group: "default",
              },
            ],
          },
        }),
      ),
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
      ),
    );

    await expect(liveRepository.listApiKeys()).rejects.toThrow("api_key.key");
  });

  test("rejects incomplete catalog pricing instead of attaching display defaults", async () => {
    server.use(
      http.get("*/api/user/models", () =>
        HttpResponse.json({ success: true, data: ["gpt-contract"] }),
      ),
      http.get("*/api/pricing", () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              model_name: "gpt-contract",
              available: true,
              official_price: {
                billing_mode: "token",
                items: [{ component: "token_input", amount: 1, unit: "token" }],
              },
            },
          ],
        }),
      ),
    );

    await expect(liveRepository.listModelCatalog("default")).rejects.toThrow(
      "pricing.gpt-contract.official_price.currency",
    );
  });
});

function authBundle(username: string, usernameEditable = false) {
  return {
    access_token: "access-token",
    access_expires_at: 1_800_000_000,
    session: { sid: "session-id" },
    user: {
      id: 9,
      username,
      username_editable: usernameEditable,
      has_password: true,
      display_name: username,
      email: `${username}@example.com`,
      group: "default",
      role: 1,
      quota: 500_000,
      used_quota: 10,
      request_count: 2,
      created_time: 1_700_000_000,
    },
  };
}

async function authenticateLiveRepository() {
  server.use(
    http.post("*/api/user/auth/refresh", () =>
      HttpResponse.json({
        success: true,
        data: {
          access_token: "access-before-security-change",
          access_expires_at: 1_800_000_000,
          session: { sid: "session-contract" },
          user: accountUser(),
        },
      }),
    ),
  );
  await liveRepository.getSession();
}

function useDefaultAccountHandlers(options: {
  passkeyEnabled?: boolean;
  twoFactorEnabled?: boolean;
}) {
  server.use(
    http.get("*/api/user/self", () =>
      HttpResponse.json({
        success: true,
        data: accountUser(),
      }),
    ),
    http.get("*/api/user/setting", () =>
      HttpResponse.json({
        success: true,
        data: {
          notify_type: "email",
          quota_warning_threshold: 500_000,
          gotify_priority: 5,
          gotify_token_configured: false,
          webhook_secret_configured: false,
          record_ip_forced: false,
          record_ip_log: false,
        },
      }),
    ),
    http.get("*/api/user/sessions", () => HttpResponse.json({ success: true, data: [] })),
    http.get("*/api/user/passkey", () =>
      HttpResponse.json({
        success: true,
        data: { enabled: options.passkeyEnabled ?? false },
      }),
    ),
    http.get("*/api/user/2fa/status", () =>
      HttpResponse.json({
        success: true,
        data: { enabled: options.twoFactorEnabled ?? false, locked: false },
      }),
    ),
    http.get("*/api/user/evm-wallet", () =>
      HttpResponse.json({
        success: true,
        data: { enabled: false, verification_method: "password" },
      }),
    ),
    http.get("*/api/status", () =>
      HttpResponse.json({ success: true, data: { quota_per_unit: 500_000 } }),
    ),
  );
}

function accountUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    username: "merchant-owner",
    username_editable: false,
    has_password: true,
    display_name: "Merchant Owner",
    email: "owner@example.com",
    group: "default",
    role: 1,
    quota: 500_000,
    used_quota: 10,
    request_count: 2,
    ...overrides,
  };
}
