import type {
  AccountActivityListInput,
  AccountActivityRecord,
  AccountData,
  AccountPreferences,
  AlertCenterData,
  ApiKeyListInput,
  ApiKeyRecord,
  BillingData,
  BillingLedgerEntry,
  BillingLedgerListInput,
  BillingTransactionListInput,
  ChangePasswordInput,
  ConsoleRepository,
  ConsoleSession,
  CreateRechargeCheckoutInput,
  CreateApiKeyInput,
  CreatedApiKey,
  DateRangeValue,
  IntegrationData,
  ModelCatalogItem,
  OnboardingData,
  OverviewData,
  PaginatedResult,
  PlaygroundMessageInput,
  PlaygroundModel,
  PlaygroundReply,
  RechargeConfiguration,
  RechargeQuoteInput,
  RequestLogAnalytics,
  RequestLogAnalyticsInput,
  RequestLogListInput,
  RequestLogRecord,
  RegisterInput,
  SignInInput,
  TeamMember,
  TaskListInput,
  TaskRecord,
  TaskTypeCounts,
  UpdateApiKeyInput,
  UpdateProfileInput,
  UsageData,
} from "./contracts";
import { dateRangeDayCount, dateRangeToUnix, timestampMatchesDateRange } from "@/lib/date-range";

function paginate<T>(
  items: T[],
  input: Pick<ApiKeyListInput, "page" | "pageSize">,
): PaginatedResult<T> {
  const start = (input.page - 1) * input.pageSize;
  return {
    items: items.slice(start, start + input.pageSize),
    page: input.page,
    pageSize: input.pageSize,
    total: items.length,
  };
}

const now = Math.floor(Date.now() / 1000);

const demoRechargeConfiguration: RechargeConfiguration = {
  amountOptions: [10, 25, 50, 100, 250, 500],
  complianceConfirmed: true,
  customCurrencySymbol: "$",
  discounts: { "100": 0.95, "250": 0.9, "500": 0.85 },
  displayType: "USD",
  externalTopupUrl: null,
  onlineEnabled: true,
  paymentCurrency: "USD",
  paymentMethods: [
    { id: "stripe-0", name: "Stripe", type: "stripe", minAmount: 10 },
    { id: "alipay-1", name: "Alipay", type: "alipay", minAmount: 10 },
  ],
  products: [
    {
      id: "starter-pack",
      name: "Starter pack",
      price: 19,
      creditUsd: 25,
      currency: "USD",
    },
    {
      id: "growth-pack",
      name: "Growth pack",
      price: 69,
      creditUsd: 100,
      currency: "USD",
    },
  ],
  quotaPerUnit: 100,
  redemptionEnabled: true,
  usdExchangeRate: 1,
};

let demoSession: ConsoleSession | null = {
  user: {
    id: 1001,
    username: "demo",
    usernameEditable: false,
    passwordSet: true,
    displayName: "Demo Developer",
    email: "demo@token-boat.local",
    group: "default",
    role: 1,
    quotaUnits: 12840,
    usedQuotaUnits: 4820,
    requestCount: 12842,
    createdAt: now - 86400 * 90,
  },
  sessionId: "demo-current-session",
};

let apiKeys: ApiKeyRecord[] = [
  {
    id: 1,
    name: "Production app",
    maskedKey: "sk-live-••••••••a82f",
    status: "active",
    createdAt: now - 86400 * 16,
    lastUsedAt: now - 3600 * 4,
    expiresAt: now + 86400 * 120,
    unlimitedQuota: false,
    remainingQuotaUsd: 75,
    usedQuotaUsd: 25,
    group: "default",
    environment: "production",
    allowedModels: ["gpt-5", "claude-sonnet-4"],
    allowedIps: ["203.0.113.0/24"],
  },
  {
    id: 2,
    name: "Local development",
    maskedKey: "sk-test-••••••••c41b",
    status: "active",
    createdAt: now - 86400 * 3,
    lastUsedAt: null,
    expiresAt: null,
    unlimitedQuota: true,
    remainingQuotaUsd: 0,
    usedQuotaUsd: 4.2,
    group: "auto",
    environment: "development",
    allowedModels: [],
    allowedIps: [],
  },
  {
    id: 3,
    name: "Legacy integration",
    maskedKey: "sk-live-••••••••73de",
    status: "disabled",
    createdAt: now - 86400 * 75,
    lastUsedAt: now - 86400 * 9,
    expiresAt: now + 86400 * 4,
    unlimitedQuota: false,
    remainingQuotaUsd: 1.2,
    usedQuotaUsd: 98.8,
    group: "default",
    environment: "production",
    allowedModels: ["gpt-4o"],
    allowedIps: [],
  },
];

let nextApiKeyId = 4;
let demoBalance = 128.4;
const demoCurrentPlanIds = new Set([2]);
const demoSubscriptionPurchases = new Map([[2, 1]]);

const activity = [
  {
    id: "req-1008",
    event: "chat",
    model: "gpt-5",
    createdAt: now - 120,
    status: "succeeded",
  },
  {
    id: "req-1007",
    event: "image",
    model: "imagen-4",
    createdAt: now - 1080,
    status: "succeeded",
  },
  {
    id: "req-1006",
    event: "embedding",
    model: "text-embedding-3",
    createdAt: now - 3600,
    status: "succeeded",
  },
  {
    id: "req-1005",
    event: "chat",
    model: "claude-sonnet-4",
    createdAt: now - 7200,
    status: "failed",
  },
] as const;

const tasks: TaskRecord[] = [
  {
    id: "task_img_8fa12",
    type: "image",
    model: "imagen-4",
    prompt: "A modern API operations center at night",
    platform: "Google",
    action: "image.generate",
    status: "succeeded",
    progress: 100,
    createdAt: now - 3600,
    startedAt: now - 3596,
    updatedAt: now - 3500,
    completedAt: now - 3500,
    failureReason: null,
    resultUrl: "https://example.com/results/task_img_8fa12.png",
    cost: 0.08,
    costUnit: "usd",
    metadata: {
      durationSeconds: null,
      resolution: "1024×1024",
      aspectRatio: "1:1",
      outputCount: 1,
      quality: "HD",
      voice: null,
      format: "PNG",
    },
  },
  {
    id: "task_vid_29c71",
    type: "video",
    model: "veo-3",
    prompt: "Slow camera orbit around a glass data sculpture",
    platform: "Google",
    action: "video.generate",
    status: "processing",
    progress: 64,
    createdAt: now - 900,
    startedAt: now - 882,
    updatedAt: now - 30,
    completedAt: null,
    failureReason: null,
    resultUrl: null,
    cost: 0.42,
    costUnit: "usd",
    metadata: {
      durationSeconds: 8,
      resolution: "1920×1080",
      aspectRatio: "16:9",
      outputCount: 1,
      quality: "1080p",
      voice: null,
      format: "MP4",
    },
  },
  {
    id: "task_audio_11bd2",
    type: "audio",
    model: "gpt-4o-mini-tts",
    prompt: "Product onboarding narration",
    platform: "OpenAI",
    action: "audio.speech",
    status: "queued",
    progress: 12,
    createdAt: now - 240,
    startedAt: null,
    updatedAt: now - 120,
    completedAt: null,
    failureReason: null,
    resultUrl: null,
    cost: 0.03,
    costUnit: "usd",
    metadata: {
      durationSeconds: 42,
      resolution: null,
      aspectRatio: null,
      outputCount: 1,
      quality: null,
      voice: "alloy",
      format: "MP3",
    },
  },
  {
    id: "task_img_4ed93",
    type: "image",
    model: "flux-1.1-pro",
    prompt: "Minimal product hero with translucent blue materials",
    platform: "Fal",
    action: "image.generate",
    status: "failed",
    progress: 46,
    createdAt: now - 5400,
    startedAt: now - 5394,
    updatedAt: now - 5320,
    completedAt: now - 5320,
    failureReason: "The service rejected the requested aspect ratio.",
    resultUrl: null,
    cost: 0,
    costUnit: "usd",
    metadata: {
      durationSeconds: null,
      resolution: "1536×1024",
      aspectRatio: "3:2",
      outputCount: 2,
      quality: "Standard",
      voice: null,
      format: "WEBP",
    },
  },
  {
    id: "task_vid_73ac9",
    type: "video",
    model: "kling-v2.1",
    prompt: "A clean macro shot of water flowing across a circuit board",
    platform: "Kling",
    action: "video.generate",
    status: "succeeded",
    progress: 100,
    createdAt: now - 9200,
    startedAt: now - 9180,
    updatedAt: now - 9010,
    completedAt: now - 9010,
    failureReason: null,
    resultUrl: "https://example.com/results/task_vid_73ac9.mp4",
    cost: 0.76,
    costUnit: "usd",
    metadata: {
      durationSeconds: 10,
      resolution: "1280×720",
      aspectRatio: "16:9",
      outputCount: 1,
      quality: "720p",
      voice: null,
      format: "MP4",
    },
  },
  {
    id: "task_audio_97ce4",
    type: "audio",
    model: "suno-v4.5",
    prompt: "Warm electronic brand theme with a short uplifting ending",
    platform: "Suno",
    action: "music.generate",
    status: "succeeded",
    progress: 100,
    createdAt: now - 12_400,
    startedAt: now - 12_390,
    updatedAt: now - 12_200,
    completedAt: now - 12_200,
    failureReason: null,
    resultUrl: "https://example.com/results/task_audio_97ce4.mp3",
    cost: 0.12,
    costUnit: "usd",
    metadata: {
      durationSeconds: 30,
      resolution: null,
      aspectRatio: null,
      outputCount: 1,
      quality: null,
      voice: "instrumental",
      format: "MP3",
    },
  },
];

const requestLogs: RequestLogRecord[] = [
  {
    id: "req-1008",
    serviceTraceId: "trace-svc-7fe26c",
    sourceIp: "203.0.113.24",
    endpoint: "/v1/chat/completions",
    model: "gpt-5",
    apiKeyName: "Production app",
    createdAt: now - 120,
    status: "succeeded",
    statusCode: 200,
    inputTokens: 1842,
    inputTokensTotal: 2142,
    outputTokens: 624,
    cacheReadTokens: 300,
    cacheWrite5mTokens: 120,
    textInputTokens: 1842,
    textOutputTokens: 624,
    toolSurcharges: [{ name: "web_search", count: 1, unitPrice: 10, totalCost: 0.01 }],
    latencyMs: 812,
    cost: 0.0184,
    billingSource: "wallet",
    billingStage: "completed",
    estimatedCost: 0.018,
    preConsumedCost: 0.02,
    finalCost: 0.0184,
    adjustmentCost: -0.0016,
    usageCountSource: "service_reported",
    usageSemantic: "openai",
    errorCode: null,
    errorMessage: null,
  },
  {
    id: "req-1007",
    serviceTraceId: "trace-svc-15d6a1",
    sourceIp: "198.51.100.17",
    endpoint: "/v1/images/generations",
    model: "imagen-4",
    apiKeyName: "Production app",
    createdAt: now - 1080,
    status: "succeeded",
    statusCode: 200,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 9340,
    cost: 0.08,
    errorCode: null,
    errorMessage: null,
  },
  {
    id: "req-1006",
    serviceTraceId: "trace-svc-c9438e",
    sourceIp: "127.0.0.1",
    endpoint: "/v1/embeddings",
    model: "text-embedding-3-large",
    apiKeyName: "Local development",
    createdAt: now - 3600,
    status: "succeeded",
    statusCode: 200,
    inputTokens: 8460,
    outputTokens: 0,
    latencyMs: 326,
    cost: 0.0011,
    errorCode: null,
    errorMessage: null,
  },
  {
    id: "req-1005",
    serviceTraceId: "trace-svc-8bbd02",
    sourceIp: "203.0.113.24",
    endpoint: "/v1/messages",
    model: "claude-sonnet-4",
    apiKeyName: "Production app",
    createdAt: now - 7200,
    status: "failed",
    statusCode: 429,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 104,
    cost: 0,
    errorCode: "rate_limit_exceeded",
    errorMessage: "The service is temporarily rate limited.",
  },
  {
    id: "req-0988",
    serviceTraceId: "trace-svc-d3fc42",
    sourceIp: null,
    endpoint: "/v1/chat/completions",
    model: "gemini-2.5-pro",
    apiKeyName: "Production app",
    createdAt: now - 86400 * 4,
    status: "succeeded",
    statusCode: 200,
    inputTokens: 3210,
    outputTokens: 902,
    latencyMs: 1240,
    cost: 0.0126,
    errorCode: null,
    errorMessage: null,
  },
];

const accountActivity: AccountActivityRecord[] = [
  {
    id: "evt-login-1003",
    eventId: "evt-login-1003",
    type: "login",
    createdAt: now - 420,
    content: "Logged in successfully via password",
    action: "login",
    parameters: { method: "password" },
    sourceIp: "203.0.113.24",
    loginMethod: "password",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  },
  {
    id: "evt-passkey-1002",
    eventId: "evt-passkey-1002",
    type: "management",
    createdAt: now - 86_400,
    content: "Registered a passkey",
    action: "user.passkey_register",
    parameters: null,
    sourceIp: "203.0.113.24",
    loginMethod: null,
    userAgent: null,
  },
  {
    id: "evt-system-1001",
    eventId: "evt-system-1001",
    type: "system",
    createdAt: now - 86_400 * 7,
    content: "New account credit granted",
    action: null,
    parameters: null,
    sourceIp: null,
    loginMethod: null,
    userAgent: null,
  },
];

const billingLedger: BillingLedgerEntry[] = [
  {
    id: "billing-refund-1002",
    eventId: "billing-refund-1002",
    type: "refund",
    createdAt: now - 7_200,
    content: "Unused task reservation returned to the account balance",
    sourceIp: null,
    amountUsd: 0.12,
    model: "seedance-2.0",
    apiKeyName: "Production app",
    taskId: "task_video_4a7d2",
  },
  {
    id: "billing-credit-1001",
    eventId: null,
    type: "topup",
    createdAt: now - 86_400 * 8,
    content: "Account recharge completed",
    sourceIp: "203.0.113.24",
    amountUsd: null,
    model: null,
    apiKeyName: null,
    taskId: null,
  },
];

const modelCatalog: ModelCatalogItem[] = [
  {
    id: "gpt-5",
    provider: "OpenAI",
    description: "Flagship reasoning model for coding, analysis, and multimodal workloads.",
    family: "reasoning",
    contextWindow: 400_000,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: 1.25,
    inputPriceQualifier: null,
    outputPrice: 10,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "million_tokens",
    outputPriceUnit: "million_tokens",
    pricingAvailable: true,
    pricingSource: "demo_price_book",
    accountPriceSource: "group",
    accountPrice: null,
    officialPrice: null,
    available: true,
    availabilityStatus: "available",
    features: ["Text", "Vision", "Tools", "Structured output"],
    supportedEndpointTypes: ["openai"],
  },
  {
    id: "claude-sonnet-4",
    provider: "Anthropic",
    description: "Balanced model for high-quality chat, coding, and visual understanding.",
    family: "chat",
    contextWindow: 200_000,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: 3,
    inputPriceQualifier: null,
    outputPrice: 15,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "million_tokens",
    outputPriceUnit: "million_tokens",
    pricingAvailable: true,
    pricingSource: "demo_price_book",
    accountPriceSource: "group",
    accountPrice: null,
    officialPrice: null,
    available: true,
    availabilityStatus: "available",
    features: ["Text", "Vision", "Tools"],
    supportedEndpointTypes: ["openai"],
  },
  {
    id: "gemini-2.5-pro",
    provider: "Google",
    description: "Long-context reasoning model with multimodal input support.",
    family: "reasoning",
    contextWindow: 1_000_000,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: 1.25,
    inputPriceQualifier: null,
    outputPrice: 10,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "million_tokens",
    outputPriceUnit: "million_tokens",
    pricingAvailable: true,
    pricingSource: "demo_price_book",
    accountPriceSource: "group",
    accountPrice: null,
    officialPrice: null,
    available: true,
    availabilityStatus: "available",
    features: ["Text", "Vision", "Audio", "Tools"],
    supportedEndpointTypes: ["openai"],
  },
  {
    id: "text-embedding-3-large",
    provider: "OpenAI",
    description: "High-quality embeddings for semantic search, retrieval, and clustering.",
    family: "embedding",
    contextWindow: 8191,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: 0.13,
    inputPriceQualifier: null,
    outputPrice: null,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "million_tokens",
    outputPriceUnit: "million_tokens",
    pricingAvailable: true,
    pricingSource: "demo_price_book",
    accountPriceSource: "group",
    accountPrice: null,
    officialPrice: null,
    available: true,
    availabilityStatus: "available",
    features: ["Embedding", "Dimensions"],
    supportedEndpointTypes: ["openai"],
  },
  {
    id: "imagen-4",
    provider: "Google",
    description: "Image generation model for high-quality visual content.",
    family: "image",
    contextWindow: null,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: 0.04,
    inputPriceQualifier: null,
    outputPrice: null,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "request",
    outputPriceUnit: "request",
    pricingAvailable: true,
    pricingSource: "demo_price_book",
    accountPriceSource: "group",
    accountPrice: null,
    officialPrice: null,
    available: true,
    availabilityStatus: "available",
    features: ["Image generation", "Prompt enhancement"],
    supportedEndpointTypes: ["openai"],
  },
  {
    id: "veo-3",
    provider: "Google",
    description: "Video generation model with optional audio output.",
    family: "video",
    contextWindow: null,
    maxOutputTokens: null,
    limitsSourceUrl: null,
    limitsVerifiedAt: null,
    inputPrice: null,
    inputPriceQualifier: null,
    outputPrice: null,
    outputPriceQualifier: null,
    currency: "USD",
    inputPriceUnit: "request",
    outputPriceUnit: "request",
    pricingAvailable: false,
    pricingSource: null,
    accountPriceSource: null,
    accountPrice: null,
    officialPrice: null,
    available: false,
    availabilityStatus: "price_unavailable",
    features: ["Video generation", "Audio"],
    supportedEndpointTypes: ["openai"],
  },
];

const integration: IntegrationData = {
  baseUrl: "https://api.example.com/v1",
  apiVersion: "2026-08-01",
  region: "Global edge",
  serviceStatus: "reachable",
  endpoints: [
    {
      name: "Chat Completions",
      method: "POST",
      path: "/v1/chat/completions",
      description: "OpenAI-compatible text and multimodal chat.",
    },
    {
      name: "Responses",
      method: "POST",
      path: "/v1/responses",
      description: "Unified response API with tools and structured output.",
    },
    {
      name: "Embeddings",
      method: "POST",
      path: "/v1/embeddings",
      description: "Create vector embeddings for search and retrieval.",
    },
    {
      name: "Models",
      method: "GET",
      path: "/v1/models",
      description: "List models available to the current API key.",
    },
  ],
};

const alertCenter: AlertCenterData = {
  platform: {
    configured: true,
    status: "operational",
    uptimePercent: 99.99,
    monitors: [
      {
        id: "api-gateway",
        group: "Token Boat",
        name: "API gateway",
        status: "operational",
        uptimePercent: 99.99,
      },
      {
        id: "task-workers",
        group: "Token Boat",
        name: "Task workers",
        status: "operational",
        uptimePercent: 99.98,
      },
    ],
  },
  rules: [
    {
      id: "alert-balance",
      type: "balance",
      name: "Low balance",
      threshold: 20,
      channel: "email",
      enabled: true,
      lastTriggeredAt: null,
    },
    {
      id: "alert-spend",
      type: "spend",
      name: "Daily spend limit",
      threshold: 50,
      channel: "webhook",
      enabled: true,
      lastTriggeredAt: now - 86400 * 12,
    },
    {
      id: "alert-errors",
      type: "error_rate",
      name: "Elevated error rate",
      threshold: 3,
      channel: "email",
      enabled: true,
      lastTriggeredAt: now - 86400 * 3,
    },
    {
      id: "alert-latency",
      type: "latency",
      name: "High latency",
      threshold: 3000,
      channel: "webhook",
      enabled: false,
      lastTriggeredAt: null,
    },
  ],
  incidents: [
    {
      id: "incident-2026-08-14",
      title: "Intermittent latency on one image route",
      status: "resolved",
      startedAt: now - 86400 * 14,
      resolvedAt: now - 86400 * 14 + 2700,
    },
  ],
};

const teamMembers: TeamMember[] = [
  {
    id: "member-1",
    name: "Demo Developer",
    email: "demo@token-boat.local",
    role: "owner",
    status: "active",
    lastActiveAt: now - 60,
  },
  {
    id: "member-2",
    name: "Lin Chen",
    email: "lin@example.com",
    role: "developer",
    status: "active",
    lastActiveAt: now - 7200,
  },
  {
    id: "member-3",
    name: "Mina Zhou",
    email: "mina@example.com",
    role: "billing",
    status: "invited",
    lastActiveAt: null,
  },
];

let account: AccountData = {
  user: demoSession.user,
  preferences: {
    balanceWarningThresholdUsd: 20,
    barkUrl: "",
    gotifyPriority: 5,
    gotifyToken: "",
    gotifyTokenConfigured: false,
    gotifyUrl: "",
    notificationEmail: "demo@token-boat.local",
    recordIpForced: true,
    recordIpLog: true,
    notifyType: "email",
    webhookSecret: "",
    webhookSecretConfigured: true,
    webhookUrl: "https://merchant.example.com/hooks/quota",
  },
  security: {
    backupCodesRemaining: null,
    passkeyEnabled: true,
    passkeyLastUsedAt: now - 3600,
    twoFactorEnabled: false,
    twoFactorLocked: false,
    emailBound: true,
    evmWalletAddress: null,
    evmWalletEnabled: false,
    evmWalletLastUsedAt: null,
    evmWalletRemovable: false,
    evmWalletVerificationMethod: "password",
  },
  sessions: [
    {
      id: "demo-current-session",
      current: true,
      method: "Passkey",
      ip: "127.0.0.1",
      userAgent: "Chrome on macOS",
      createdAt: now - 86400 * 4,
      lastActiveAt: now - 60,
      expiresAt: now + 86400 * 26,
    },
    {
      id: "demo-mobile-session",
      current: false,
      method: "Password",
      ip: "192.0.2.24",
      userAgent: "Safari on iPhone",
      createdAt: now - 86400 * 12,
      lastActiveAt: now - 86400 * 2,
      expiresAt: now + 86400 * 18,
    },
  ],
};

function demoSecurityResult() {
  if (!demoSession) throw new Error("The demo session is unavailable.");
  return { account, session: demoSession };
}

function buildBilling(): BillingData {
  return {
    balance: demoBalance,
    totalUsage: demoSession
      ? demoSession.user.usedQuotaUnits / demoRechargeConfiguration.quotaPerUnit
      : 0,
    monthSpend: 48.2,
    pendingAmount: 0,
    currency: "USD",
    transactions: [
      {
        id: "tx-2041",
        type: "usage",
        amount: -12.84,
        status: "completed",
        createdAt: now - 86400,
        description: "API usage · August 27",
      },
      {
        id: "tx-2038",
        type: "topup",
        amount: 100,
        status: "completed",
        createdAt: now - 86400 * 8,
        description: "Card top-up",
      },
      {
        id: "tx-2020",
        type: "subscription",
        amount: -29,
        status: "completed",
        createdAt: now - 86400 * 20,
        description: "Developer Pro subscription",
      },
    ],
    plans: [
      {
        id: 1,
        name: "Pay as you go",
        price: 0,
        currency: "USD",
        interval: "month",
        durationUnit: "month",
        durationValue: 1,
        quotaUsd: 0,
        unlimitedQuota: true,
        quotaResetPeriod: "never",
        features: ["Usage-based billing", "All public models", "Community support"],
        current: demoCurrentPlanIds.has(1),
        purchaseCount: demoSubscriptionPurchases.get(1) ?? 0,
        purchaseLimit: 0,
        paymentMethods: [{ id: "balance", name: "Account balance", type: "balance" }],
      },
      {
        id: 2,
        name: "Developer Pro",
        price: 29,
        currency: "USD",
        interval: "month",
        durationUnit: "month",
        durationValue: 1,
        quotaUsd: 200,
        unlimitedQuota: false,
        quotaResetPeriod: "monthly",
        features: ["$200.00000 monthly quota", "Priority routing", "Email support"],
        current: demoCurrentPlanIds.has(2),
        purchaseCount: demoSubscriptionPurchases.get(2) ?? 0,
        purchaseLimit: 0,
        paymentMethods: [
          { id: "balance", name: "Account balance", type: "balance" },
          { id: "stripe", name: "Stripe", type: "stripe" },
        ],
      },
      {
        id: 3,
        name: "Team",
        price: 99,
        currency: "USD",
        interval: "month",
        durationUnit: "month",
        durationValue: 1,
        quotaUsd: 800,
        unlimitedQuota: false,
        quotaResetPeriod: "monthly",
        features: ["$800.00000 monthly quota", "Shared workspace", "Priority support"],
        current: demoCurrentPlanIds.has(3),
        purchaseCount: demoSubscriptionPurchases.get(3) ?? 0,
        purchaseLimit: 3,
        paymentMethods: [
          { id: "balance", name: "Account balance", type: "balance" },
          { id: "stripe", name: "Stripe", type: "stripe" },
          {
            id: "alipay",
            name: "Alipay",
            type: "epay",
            paymentMethod: "alipay",
          },
        ],
      },
    ],
  };
}

function buildUsage(range: DateRangeValue): UsageData {
  const days = dateRangeDayCount(range);
  const visibleDays = Math.min(days, 14);
  const series = Array.from({ length: visibleDays }, (_, index) => {
    const date = new Date((now - (visibleDays - index - 1) * 86400) * 1000);
    const requests = 640 + ((index * 193) % 760);
    return {
      date: date.toISOString().slice(0, 10),
      requests,
      cost: Number((requests * 0.0037).toFixed(2)),
      tokens: requests * 816,
    };
  });
  const rangeMultiplier = days / 7;

  return {
    range,
    totalRequests: Math.round(12842 * rangeMultiplier),
    totalTokens: Math.round(8_420_000 * rangeMultiplier),
    totalCost: Number((48.2 * rangeMultiplier).toFixed(2)),
    averageLatencyMs: 842,
    successRate: 99.92,
    series,
    models: [
      {
        model: "gpt-5",
        requests: 5834,
        tokens: 3_812_440,
        cost: 21.42,
        successRate: 99.96,
      },
      {
        model: "claude-sonnet-4",
        requests: 3210,
        tokens: 2_980_180,
        cost: 18.3,
        successRate: 99.84,
      },
      {
        model: "gemini-2.5-pro",
        requests: 2218,
        tokens: 1_144_540,
        cost: 6.8,
        successRate: 99.91,
      },
      {
        model: "imagen-4",
        requests: 1580,
        tokens: 482_840,
        cost: 1.68,
        successRate: 99.74,
      },
    ],
    apiKeys: [
      {
        apiKeyId: 1,
        apiKeyName: "Production",
        requests: Math.round(7_842 * rangeMultiplier),
        tokens: Math.round(5_120_000 * rangeMultiplier),
        cost: Number((28.4 * rangeMultiplier).toFixed(2)),
        successRate: 99.95,
      },
      {
        apiKeyId: 2,
        apiKeyName: "Batch",
        requests: Math.round(3_150 * rangeMultiplier),
        tokens: Math.round(2_140_000 * rangeMultiplier),
        cost: Number((12.6 * rangeMultiplier).toFixed(2)),
        successRate: 99.88,
      },
      {
        apiKeyId: 3,
        apiKeyName: "Media",
        requests: Math.round(1_850 * rangeMultiplier),
        tokens: Math.round(1_160_000 * rangeMultiplier),
        cost: Number((7.2 * rangeMultiplier).toFixed(2)),
        successRate: 99.79,
      },
    ],
    recentRequests: [...activity],
  };
}

function filterRequestLogs(input: RequestLogAnalyticsInput): RequestLogRecord[] {
  const keyword = input.keyword.trim().toLowerCase();
  return requestLogs.filter((item) => {
    if (!timestampMatchesDateRange(item.createdAt, input.range)) return false;
    if (input.status !== "all" && item.status !== input.status) return false;
    if (!keyword) return true;
    if (input.searchField === "request") return item.id.toLowerCase().includes(keyword);
    if (input.searchField === "service_trace") {
      return item.serviceTraceId?.toLowerCase().includes(keyword) ?? false;
    }
    if (input.searchField === "model") {
      return item.model?.toLowerCase().includes(keyword) ?? false;
    }
    return item.apiKeyName?.toLowerCase().includes(keyword) ?? false;
  });
}

export const demoRepository: ConsoleRepository = {
  mode: "demo",
  async getAuthCapabilities() {
    return {
      emailVerificationEnabled: true,
      evmWalletEnabled: false,
      evmWalletRegistrationEnabled: false,
      oauthProviders: [],
      passkeyEnabled: false,
      passwordEnabled: true,
      registrationEnabled: true,
      turnstileEnabled: false,
      turnstileSiteKey: "",
    };
  },
  async createOAuthLoginFlow() {
    throw new Error("OAuth is unavailable in demo mode.");
  },
  async completeOAuthLogin() {
    throw new Error("OAuth is unavailable in demo mode.");
  },
  async register(input: RegisterInput) {
    const username = input.username.trim();
    demoSession = {
      user: {
        ...account.user,
        username,
        displayName: username,
        email: input.email?.trim() ?? "",
      },
      sessionId: "demo-current-session",
    };
    account = { ...account, user: demoSession.user };
  },
  async sendEmailVerification() {},
  async requestPasswordReset() {},
  async confirmPasswordReset() {
    return "DemoReset#2026";
  },
  async getSession() {
    return demoSession;
  },
  async signIn(input: SignInInput) {
    const displayName = input.username.trim() || "Demo Developer";
    demoSession = {
      user: { ...account.user, username: displayName, displayName },
      sessionId: "demo-current-session",
    };
    account = { ...account, user: demoSession.user };
    return { kind: "authenticated", session: demoSession };
  },
  async verifyTwoFactorLogin() {
    if (!demoSession) throw new Error("The demo session is unavailable.");
    return demoSession;
  },
  async signInWithPasskey() {
    return demoSession;
  },
  async beginEVMWalletAuth(input) {
    return {
      address: input.address,
      chainId: input.chainId,
      expiresAt: Math.floor(Date.now() / 1_000) + 300,
      flowToken: "demo-evm-flow",
      message: "Demo SIWE message",
      nonce: "DemoNonce1234",
    };
  },
  async completeEVMWalletAuth() {
    if (!demoSession) {
      demoSession = {
        user: { ...account.user, username: "evm_demo", displayName: "0xDemo…EVM" },
        sessionId: "demo-evm-session",
      };
    }
    return demoSession;
  },
  clearLocalSession() {
    demoSession = null;
  },
  async signOut() {
    demoSession = null;
  },
  async getOverview(range: DateRangeValue): Promise<OverviewData> {
    const rangeMultiplier = dateRangeDayCount(range);
    return {
      availableBalance: demoBalance,
      requestCount: Math.round(1840 * rangeMultiplier),
      activeApiKeys: apiKeys.filter((item) => item.status === "active").length,
      successRate: 99.92,
      recentActivity: [...activity],
    };
  },
  async getOnboarding(): Promise<OnboardingData> {
    return {
      steps: [
        { id: "create-key", complete: apiKeys.length > 0 },
        { id: "fund-account", complete: demoBalance > 0 },
        { id: "first-request", complete: true },
      ],
      exampleModel: "gpt-5",
      baseUrl: "https://api.example.com/v1",
    };
  },
  async listApiKeys() {
    return [...apiKeys];
  },
  async getApiKeysPage(input: ApiKeyListInput) {
    const keyword = input.keyword.trim().toLowerCase();
    const filtered = apiKeys.filter((item) => {
      if (input.status !== "all" && item.status !== input.status) return false;
      return (
        !keyword || `${item.name} ${item.maskedKey} ${item.group}`.toLowerCase().includes(keyword)
      );
    });
    filtered.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(filtered, input);
  },
  async listApiKeyGroups() {
    return [
      { value: "default", description: "Default account routing", ratio: 1 },
      { value: "auto", description: "Automatic routing", ratio: "automatic" },
    ];
  },
  async createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const id = nextApiKeyId;
    nextApiKeyId += 1;
    const suffix = id.toString(16).padStart(4, "0");
    const secret = `sk-demo-${id}-token-boat-${suffix}`;
    const record: ApiKeyRecord = {
      id,
      name: input.name,
      maskedKey: `sk-demo-••••••••${suffix}`,
      status: "active",
      createdAt: Math.floor(Date.now() / 1000),
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      unlimitedQuota: input.unlimitedQuota,
      remainingQuotaUsd: input.unlimitedQuota ? 0 : input.quotaUsd,
      usedQuotaUsd: 0,
      group: input.group,
      environment: input.environment,
      allowedModels: input.allowedModels,
      allowedIps: input.allowedIps,
    };
    apiKeys = [record, ...apiKeys];
    return { record, secret };
  },
  async updateApiKey(input: UpdateApiKeyInput) {
    const existing = apiKeys.find((item) => item.id === input.id);
    if (!existing) throw new Error("API key not found.");
    const updated: ApiKeyRecord = {
      ...existing,
      name: input.name,
      expiresAt: input.expiresAt,
      unlimitedQuota: input.unlimitedQuota,
      remainingQuotaUsd: input.unlimitedQuota ? 0 : input.remainingQuotaUsd,
      group: input.group,
      environment: input.environment,
      allowedModels: input.allowedModels,
      allowedIps: input.allowedIps,
    };
    apiKeys = apiKeys.map((item) => (item.id === input.id ? updated : item));
    return updated;
  },
  async setApiKeyEnabled(id: number, enabled: boolean) {
    const existing = apiKeys.find((item) => item.id === id);
    if (!existing) throw new Error("API key not found.");
    const updated: ApiKeyRecord = {
      ...existing,
      status: enabled ? "active" : "disabled",
    };
    apiKeys = apiKeys.map((item) => (item.id === id ? updated : item));
    return updated;
  },
  async revokeApiKey(id: number) {
    apiKeys = apiKeys.filter((item) => item.id !== id);
  },
  async listPlaygroundModels(group = "default"): Promise<PlaygroundModel[]> {
    return [
      { id: "gpt-5", label: "GPT-5", group: "default" },
      { id: "claude-sonnet-4", label: "Claude Sonnet 4", group: "default" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", group: "auto" },
    ].filter((item) => item.group === group || group === "auto");
  },
  async sendPlaygroundMessage(
    input: PlaygroundMessageInput,
    signal?: AbortSignal,
  ): Promise<PlaygroundReply> {
    if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
    return {
      id: `reply-${Date.now()}`,
      content: `Demo response from ${input.model}: ${input.messages.at(-1)?.content ?? ""}\n\nConnect live mode to send this prompt through /pg/chat/completions.`,
      model: input.model,
      inputTokens: Math.max(
        12,
        Math.ceil(
          (input.systemPrompt.length +
            input.messages.reduce((total, message) => total + message.content.length, 0)) /
            4,
        ),
      ),
      outputTokens: 48,
      latencyMs: 684,
      estimatedCost: 0.0038,
    };
  },
  async getUsage(range: DateRangeValue) {
    return buildUsage(range);
  },
  async getIntegration() {
    return integration;
  },
  async listModelCatalog() {
    return modelCatalog;
  },
  async getRequestLogsPage(input: RequestLogListInput) {
    const filtered = filterRequestLogs(input);
    filtered.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(filtered, input);
  },
  async getRequestLogAnalytics(input: RequestLogAnalyticsInput): Promise<RequestLogAnalytics> {
    const filtered = filterRequestLogs(input);
    const days = dateRangeDayCount(input.range);
    const bucketSeconds = days <= 1 ? 300 : days <= 7 ? 3_600 : days <= 31 ? 21_600 : 86_400;
    const unixRange = dateRangeToUnix(input.range);
    const timezoneOffsetSeconds = -new Date().getTimezoneOffset() * 60;
    const firstBucket =
      Math.floor((unixRange.start + timezoneOffsetSeconds) / bucketSeconds) * bucketSeconds -
      timezoneOffsetSeconds;
    const lastBucket =
      Math.floor((unixRange.end + timezoneOffsetSeconds) / bucketSeconds) * bucketSeconds -
      timezoneOffsetSeconds;
    const buckets = new Map<number, RequestLogRecord[]>();
    const minuteTotals = new Map<number, { requests: number; tokens: number }>();
    for (const log of filtered) {
      const bucketStart =
        Math.floor((log.createdAt + timezoneOffsetSeconds) / bucketSeconds) * bucketSeconds -
        timezoneOffsetSeconds;
      buckets.set(bucketStart, [...(buckets.get(bucketStart) ?? []), log]);
      const minute = Math.floor(log.createdAt / 60);
      const minuteTotal = minuteTotals.get(minute) ?? {
        requests: 0,
        tokens: 0,
      };
      minuteTotal.requests += 1;
      if (log.status === "succeeded") {
        minuteTotal.tokens += log.inputTokens + log.outputTokens;
      }
      minuteTotals.set(minute, minuteTotal);
    }
    const series: RequestLogAnalytics["series"] = [];
    for (let bucketStart = firstBucket; bucketStart <= lastBucket; bucketStart += bucketSeconds) {
      const logs = buckets.get(bucketStart) ?? [];
      const succeeded = logs.filter((log) => log.status === "succeeded").length;
      const failed = logs.length - succeeded;
      let tokens = 0;
      let cost = 0;
      let cacheHitTokens = 0;
      let cacheRateInputTokens = 0;
      let cacheObservations = 0;
      let completeCacheObservations = 0;
      for (const log of logs) {
        if (log.status === "succeeded") tokens += log.inputTokens + log.outputTokens;
        cost += log.cost;
        if (log.cacheReadTokens == null) continue;
        cacheObservations += 1;
        cacheHitTokens += log.cacheReadTokens;
        if (log.inputTokensTotal == null) continue;
        completeCacheObservations += 1;
        cacheRateInputTokens += log.inputTokensTotal;
      }
      const bucketMinutes = bucketSeconds / 60;
      series.push({
        bucketStart,
        bucketSeconds,
        succeeded,
        failed,
        rpm: logs.length / bucketMinutes,
        tpm: tokens / bucketMinutes,
        tokens,
        cost,
        cacheHitTokens,
        cacheHitRate:
          cacheObservations > 0 &&
          cacheObservations === completeCacheObservations &&
          cacheRateInputTokens > 0
            ? (cacheHitTokens / cacheRateInputTokens) * 100
            : null,
      });
    }
    const failureCount = filtered.filter((log) => log.status === "failed").length;
    let totalTokens = 0;
    let cacheHitTokens = 0;
    let cacheRateInputTokens = 0;
    let cacheObservations = 0;
    let completeCacheObservations = 0;
    for (const log of filtered) {
      if (log.status === "succeeded") totalTokens += log.inputTokens + log.outputTokens;
      if (log.cacheReadTokens == null) continue;
      cacheObservations += 1;
      cacheHitTokens += log.cacheReadTokens;
      if (log.inputTokensTotal == null) continue;
      completeCacheObservations += 1;
      cacheRateInputTokens += log.inputTokensTotal;
    }
    return {
      requestCount: filtered.length,
      failureCount,
      failureRate: filtered.length > 0 ? (failureCount / filtered.length) * 100 : null,
      peakRpm: Math.max(0, ...[...minuteTotals.values()].map((value) => value.requests)),
      peakTpm: Math.max(0, ...[...minuteTotals.values()].map((value) => value.tokens)),
      totalTokens,
      totalCost: filtered.reduce((total, log) => total + log.cost, 0),
      cacheHitTokens,
      cacheHitRate:
        cacheObservations > 0 &&
        cacheObservations === completeCacheObservations &&
        cacheRateInputTokens > 0
          ? (cacheHitTokens / cacheRateInputTokens) * 100
          : null,
      series,
    };
  },
  async getRequestLog(requestId: string) {
    const request = requestLogs.find((item) => item.id === requestId.trim());
    if (!request) throw new Error("Request not found.");
    return request;
  },
  async getAccountActivityPage(input: AccountActivityListInput) {
    const filtered = accountActivity.filter(
      (item) =>
        timestampMatchesDateRange(item.createdAt, input.range) &&
        (input.type === "all" || item.type === input.type),
    );
    filtered.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(filtered, input);
  },
  async getBillingLedgerPage(input: BillingLedgerListInput) {
    const filtered = billingLedger.filter(
      (item) =>
        timestampMatchesDateRange(item.createdAt, input.range) &&
        (input.type === "all" || item.type === input.type),
    );
    filtered.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(filtered, input);
  },
  async getAlertCenter() {
    return alertCenter;
  },
  async listTeamMembers() {
    return teamMembers;
  },
  async getTasksPage(input: TaskListInput) {
    const filtered = tasks.filter(
      (item) =>
        timestampMatchesDateRange(item.createdAt, input.range) &&
        (input.status === "all" || item.status === input.status) &&
        (input.type === "all" || item.type === input.type),
    );
    filtered.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(filtered, input);
  },
  async getTaskTypeCounts(
    input: Omit<TaskListInput, "page" | "pageSize" | "type">,
  ): Promise<TaskTypeCounts> {
    const filtered = tasks.filter(
      (item) =>
        timestampMatchesDateRange(item.createdAt, input.range) &&
        (input.status === "all" || item.status === input.status),
    );
    return {
      all: filtered.length,
      image: filtered.filter((item) => item.type === "image").length,
      video: filtered.filter((item) => item.type === "video").length,
      audio: filtered.filter((item) => item.type === "audio").length,
    };
  },
  async getBilling() {
    return buildBilling();
  },
  async getBillingTransactionsPage(input: BillingTransactionListInput) {
    const keyword = input.keyword.trim().toLowerCase();
    const transactions = buildBilling().transactions.filter((item) => {
      if (!timestampMatchesDateRange(item.createdAt, input.range)) return false;
      if (input.status !== "all" && item.status !== input.status) return false;
      if (input.type !== "all" && item.type !== input.type) return false;
      return !keyword || `${item.id} ${item.description}`.toLowerCase().includes(keyword);
    });
    transactions.sort((left, right) =>
      input.order === "asc" ? left.createdAt - right.createdAt : right.createdAt - left.createdAt,
    );
    return paginate(transactions, input);
  },
  async redeemCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (normalized !== "TOKEN-BOAT-DEMO") {
      throw new Error("The redemption code is invalid.");
    }
    demoBalance += 25;
    return buildBilling();
  },
  async getRechargeConfiguration() {
    return demoRechargeConfiguration;
  },
  async getRechargeQuote(input: RechargeQuoteInput) {
    const discount = demoRechargeConfiguration.discounts[String(input.amount)] ?? 1;
    return {
      amount: Number((input.amount * discount).toFixed(2)),
      currency: input.currency,
    };
  },
  async createRechargeCheckout(input: CreateRechargeCheckoutInput) {
    demoBalance += input.product?.creditUsd ?? input.amount;
    return { kind: "demo" as const };
  },
  async purchaseSubscription(input) {
    const plan = buildBilling().plans.find((item) => item.id === input.planId);
    if (!plan) throw new Error("Subscription plan not found.");
    if (input.method.type === "balance" && demoBalance < plan.price) {
      throw new Error("Insufficient account balance.");
    }
    if (input.method.type === "balance") demoBalance -= plan.price;
    demoCurrentPlanIds.add(plan.id);
    demoSubscriptionPurchases.set(plan.id, (demoSubscriptionPurchases.get(plan.id) ?? 0) + 1);
    return { kind: "completed" as const };
  },
  async getPaymentConfirmation() {
    return "completed" as const;
  },
  async getAccount() {
    return account;
  },
  async updateProfile(input: UpdateProfileInput) {
    const user = {
      ...account.user,
      username: account.user.usernameEditable ? input.username : account.user.username,
      usernameEditable: false,
      displayName: input.displayName,
      email: input.email,
    };
    account = { ...account, user };
    if (demoSession) demoSession = { ...demoSession, user };
    return account;
  },
  async changePassword(_input: ChangePasswordInput) {
    return demoSecurityResult();
  },
  async updatePreferences(input: AccountPreferences) {
    account = {
      ...account,
      preferences: {
        ...input,
        gotifyToken: "",
        gotifyTokenConfigured: input.gotifyTokenConfigured || Boolean(input.gotifyToken),
        webhookSecret: "",
        webhookSecretConfigured: input.webhookSecretConfigured || Boolean(input.webhookSecret),
      },
    };
    return account;
  },
  async revokeSession(id: string) {
    account = {
      ...account,
      sessions: account.sessions.filter((session) => session.id !== id),
    };
    return account;
  },
  async revokeOtherSessions() {
    const revokedCount = account.sessions.filter((session) => !session.current).length;
    account = {
      ...account,
      sessions: account.sessions.filter((session) => session.current),
    };
    return { account, revokedCount };
  },
  async setupTwoFactor() {
    return {
      secret: "JBSWY3DPEHPK3PXP",
      qrCodeData: "otpauth://totp/TokenBoat:demo?secret=JBSWY3DPEHPK3PXP&issuer=TokenBoat",
      backupCodes: ["TB-7K2Q-9M4P", "TB-3N8R-5X6C", "TB-1V7B-4L9D", "TB-6F2H-8J3S", "TB-5W9E-2A7T"],
    };
  },
  async enableTwoFactor() {
    account = {
      ...account,
      security: {
        ...account.security,
        backupCodesRemaining: 5,
        twoFactorEnabled: true,
      },
    };
    return demoSecurityResult();
  },
  async disableTwoFactor() {
    account = {
      ...account,
      security: {
        ...account.security,
        backupCodesRemaining: null,
        twoFactorEnabled: false,
      },
    };
    return demoSecurityResult();
  },
  async regenerateTwoFactorBackupCodes() {
    const backupCodes = [
      "TB-9Q4M-2K7P",
      "TB-8R5X-3N6C",
      "TB-7B1V-9L4D",
      "TB-2H6F-3J8S",
      "TB-9E5W-7A2T",
    ];
    account = {
      ...account,
      security: {
        ...account.security,
        backupCodesRemaining: backupCodes.length,
      },
    };
    return { ...demoSecurityResult(), backupCodes };
  },
  async registerPasskey() {
    account = {
      ...account,
      security: {
        ...account.security,
        passkeyEnabled: true,
        passkeyLastUsedAt: Math.floor(Date.now() / 1000),
      },
    };
    return demoSecurityResult();
  },
  async removePasskey() {
    account = {
      ...account,
      security: {
        ...account.security,
        passkeyEnabled: false,
        passkeyLastUsedAt: null,
      },
    };
    return demoSecurityResult();
  },
  async createEVMWalletSecurityProof() {
    return "demo-wallet-proof";
  },
  async beginEVMWalletBinding(input) {
    return {
      address: input.address,
      chainId: input.chainId,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      flowToken: "demo-wallet-flow",
      message: "demo wallet message",
      nonce: "demowalletnonce",
    };
  },
  async completeEVMWalletBinding() {
    account = {
      ...account,
      security: {
        ...account.security,
        evmWalletAddress: "0x0000000000000000000000000000000000000001",
        evmWalletEnabled: true,
        evmWalletLastUsedAt: Math.floor(Date.now() / 1000),
        evmWalletRemovable: true,
      },
    };
    return demoSecurityResult();
  },
  async removeEVMWallet() {
    account = {
      ...account,
      security: {
        ...account.security,
        evmWalletAddress: null,
        evmWalletEnabled: false,
        evmWalletLastUsedAt: null,
        evmWalletRemovable: false,
      },
    };
    return demoSecurityResult();
  },
  async beginEVMWalletPasswordSetup(input) {
    return {
      address: input.address,
      chainId: input.chainId,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      flowToken: "demo-wallet-password-flow",
      message: "demo wallet password setup message",
      nonce: "demopasswordnonce",
    };
  },
  async completeEVMWalletPasswordSetup() {
    const user = { ...account.user, passwordSet: true };
    account = { ...account, user };
    if (demoSession) demoSession = { ...demoSession, user };
    return demoSecurityResult();
  },
};
