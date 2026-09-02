export type ConsoleDataMode = "demo" | "live";

export type ConsoleUser = {
  id: number;
  username: string;
  usernameEditable: boolean;
  passwordSet: boolean;
  displayName: string;
  email: string;
  group: string;
  role: number;
  /** Raw backend quota units. Convert with quotaPerUnit before display. */
  quotaUnits: number;
  /** Raw backend quota units. Convert with quotaPerUnit before display. */
  usedQuotaUnits: number;
  requestCount: number;
  createdAt: number | null;
};

export type ConsoleSession = {
  user: ConsoleUser;
  accessToken?: string;
  accessExpiresAt?: number;
  sessionId?: string;
};

export type SignInInput = {
  username: string;
  password: string;
  turnstileToken?: string;
};

export type OAuthProvider = {
  id: string;
  name: string;
  clientId: string;
  authorizationEndpoint: string;
  scopes: string;
  kind: "github" | "discord" | "oidc" | "linuxdo" | "custom";
};

export type OAuthLoginFlow = {
  flowToken: string;
  redirectUri: string;
};

export type OAuthCallbackInput = {
  provider: string | null;
  state: string;
  code?: string;
  error?: string;
  errorDescription?: string;
};

export type AuthCapabilities = {
  emailVerificationEnabled: boolean;
  evmWalletEnabled: boolean;
  evmWalletRegistrationEnabled: boolean;
  oauthProviders: OAuthProvider[];
  passkeyEnabled: boolean;
  passwordEnabled: boolean;
  registrationEnabled: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
};

export type EVMWalletAuthBeginInput = {
  address: string;
  affiliateCode?: string;
  chainId: number;
  intent: "login" | "register";
  turnstileToken?: string;
};

export type EVMWalletAuthChallenge = {
  address: string;
  chainId: number;
  expiresAt: number;
  flowToken: string;
  message: string;
  nonce: string;
};

export type EVMWalletAuthCompleteInput = {
  flowToken: string;
  signature: string;
};

export type RegisterInput = {
  affiliateCode?: string;
  email?: string;
  password: string;
  turnstileToken?: string;
  username: string;
  verificationCode?: string;
};

export type PasswordResetRequestInput = {
  email: string;
  turnstileToken?: string;
};

export type PasswordResetConfirmInput = {
  email: string;
  token: string;
};

export type EmailVerificationInput = {
  email: string;
  turnstileToken?: string;
};

export type TwoFactorLoginChallenge = {
  kind: "two_factor";
  flowToken: string;
  expiresAt: number;
};

export type SignInResult =
  | { kind: "authenticated"; session: ConsoleSession }
  | TwoFactorLoginChallenge;

export type VerifyTwoFactorLoginInput = {
  code: string;
  flowToken: string;
};

export type ActivityRecord = {
  id: string;
  event: "chat" | "image" | "embedding" | "task" | "unknown";
  model: string | null;
  createdAt: number;
  status: "succeeded" | "failed" | "processing";
};

export type DateRangePreset =
  | "today"
  | "yesterday"
  | "3d"
  | "7d"
  | "14d"
  | "30d"
  | "90d"
  | "180d"
  | "365d"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

export type SortOrder = "asc" | "desc";

export type PaginationInput = {
  page: number;
  pageSize: number;
  order: SortOrder;
};

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type OverviewData = {
  availableBalance: number;
  requestCount: number;
  activeApiKeys: number;
  successRate: number | null;
  recentActivity: ActivityRecord[];
};

export type OnboardingStep = {
  id: "create-key" | "fund-account" | "first-request";
  complete: boolean;
};

export type OnboardingData = {
  steps: OnboardingStep[];
  exampleModel: string | null;
  baseUrl: string;
};

export type ApiKeyStatus = "active" | "disabled" | "expired" | "exhausted" | "unknown";

export type ApiKeyGroupOption = {
  value: string;
  description: string | null;
  ratio: number | string | null;
};

export type ApiKeyRecord = {
  id: number;
  name: string;
  maskedKey: string;
  status: ApiKeyStatus;
  createdAt: number;
  lastUsedAt: number | null;
  expiresAt: number | null;
  unlimitedQuota: boolean;
  remainingQuotaUsd: number;
  usedQuotaUsd: number;
  group: string;
  environment: "development" | "staging" | "production" | "unclassified";
  allowedModels: string[];
  allowedIps: string[];
};

export type ApiKeyListInput = PaginationInput & {
  keyword: string;
  status: "all" | Exclude<ApiKeyStatus, "unknown">;
};

export type CreateApiKeyInput = {
  name: string;
  expiresAt: number | null;
  unlimitedQuota: boolean;
  quotaUsd: number;
  group: string;
  environment: ApiKeyRecord["environment"];
  allowedModels: string[];
  allowedIps: string[];
};

export type CreatedApiKey = {
  record: ApiKeyRecord;
  secret: string;
};

export type UpdateApiKeyInput = {
  id: number;
  name: string;
  expiresAt: number | null;
  unlimitedQuota: boolean;
  remainingQuotaUsd: number;
  group: string;
  environment: ApiKeyRecord["environment"];
  allowedModels: string[];
  allowedIps: string[];
};

export type PlaygroundModel = {
  id: string;
  label: string;
  group: string;
};

export type PlaygroundConversation = {
  id: string;
  title: string;
  apiKeyId: number;
  group: string;
  model: string;
  messages: PlaygroundStoredMessage[];
  createdAt: number;
  updatedAt: number;
};

export type CreatePlaygroundConversationInput = {
  apiKeyId: number;
  group: string;
  model: string;
};

export type PlaygroundStoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metrics?: PlaygroundMessageMetrics;
};

export type PlaygroundMessageMetrics = {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};

export type PlaygroundConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PlaygroundMessageInput = {
  apiKeyId: number;
  apiKeyName: string;
  group: string;
  model: string;
  systemPrompt: string;
  messages: PlaygroundConversationMessage[];
  temperature: number;
  maxTokens: number;
};

export type PlaygroundReply = {
  id: string;
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCost: number | null;
};

export type UsagePoint = {
  date: string;
  requests: number;
  cost: number;
  tokens: number;
};

export type ModelUsage = {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number | null;
};

export type ApiKeyUsage = {
  apiKeyId: number;
  apiKeyName: string | null;
  requests: number;
  tokens: number;
  cost: number;
  successRate: number | null;
};

export type UsageData = {
  range: DateRangeValue;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatencyMs: number | null;
  successRate: number | null;
  series: UsagePoint[];
  models: ModelUsage[];
  apiKeys: ApiKeyUsage[];
  recentRequests: ActivityRecord[];
};

export type ModelCatalogItem = {
  id: string;
  provider: string | null;
  description: string | null;
  family: "chat" | "reasoning" | "embedding" | "image" | "audio" | "video" | "unknown";
  contextWindow: number | null;
  maxOutputTokens: number | null;
  limitsSourceUrl: string | null;
  limitsVerifiedAt: number | null;
  inputPrice: number | null;
  inputPriceQualifier: "from" | null;
  inputPriceUnit: "million_tokens" | "request" | "second" | null;
  outputPrice: number | null;
  outputPriceQualifier: "from" | null;
  outputPriceUnit: "million_tokens" | "request" | "second" | null;
  currency: string | null;
  pricingAvailable: boolean;
  pricingSource: string | null;
  accountPriceSource: "group" | null;
  accountPrice: ModelCatalogPriceSummary | null;
  officialPrice: ModelCatalogPriceSummary | null;
  available: boolean;
  availabilityStatus: string | null;
  features: string[];
  supportedEndpointTypes: string[];
};

export type ModelCatalogPriceSummary = {
  currency: string;
  billingMode: string;
  priceStructure: string;
  comparisonScope: string | null;
  candidateCount: number | null;
  items: ModelCatalogPriceItem[];
};

export type ModelCatalogPriceItem = {
  key: string;
  component: string;
  amount: number | null;
  baseAmount: number | null;
  unit: string;
  unitSize: number | null;
  tier: string | null;
  upperBound: string | null;
  operation: string | null;
  quality: string | null;
  resolution: string | null;
  withAudio: string | null;
  appliedGroup: string | null;
  appliedGroupLabel: string | null;
};

export type RequestLogStreamStatus = {
  status: string | null;
  endReason: string | null;
  errorCount: number | null;
  endError: string | null;
  errors: string[];
};

export type RequestLogToolSurcharge = {
  name: string;
  count: number;
  unitPrice: number;
  totalCost: number;
};

export type RequestLogTaskDetails = {
  id: string;
  platform: string | null;
  action: string | null;
  status: string | null;
  durationMs: number | null;
  refundedCost: number | null;
  failureReason: string | null;
  refundReason: string | null;
};

export type RequestLogRecord = {
  id: string;
  serviceTraceId?: string | null;
  sourceIp?: string | null;
  endpoint: string | null;
  model: string | null;
  apiKeyName: string | null;
  group?: string | null;
  createdAt: number;
  status: "succeeded" | "failed" | "processing";
  statusCode: number | null;
  isStream?: boolean | null;
  inputTokens: number;
  inputTokensTotal?: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
  imageTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
  textInputTokens?: number;
  textOutputTokens?: number;
  toolSurcharges?: RequestLogToolSurcharge[];
  latencyMs: number | null;
  firstTokenLatencyMs?: number | null;
  cost: number;
  quotaPerUnit?: number;
  billingMode?: string | null;
  billingTier?: string | null;
  billingSource?: string | null;
  billingPreference?: string | null;
  billingStage?: string | null;
  estimatedCost?: number | null;
  preConsumedCost?: number | null;
  finalCost?: number | null;
  adjustmentCost?: number | null;
  outstandingCost?: number | null;
  subscriptionPlanTitle?: string | null;
  subscriptionConsumedCost?: number | null;
  subscriptionRemainingCost?: number | null;
  usageSemantic?: string | null;
  usageCountSource?: string | null;
  requestPolicyApplied?: boolean;
  task?: RequestLogTaskDetails | null;
  reasoningEffort?: string | null;
  streamStatus?: RequestLogStreamStatus | null;
  content?: string | null;
  errorCode: string | null;
  errorType?: string | null;
  errorMessage: string | null;
};

export type RequestLogListInput = PaginationInput & {
  keyword: string;
  range: DateRangeValue;
  searchField: "request" | "service_trace" | "model" | "api_key";
  status: "all" | RequestLogRecord["status"];
};

export type RequestLogAnalyticsInput = Pick<
  RequestLogListInput,
  "keyword" | "range" | "searchField" | "status"
>;

export type RequestLogAnalyticsPoint = {
  bucketStart: number;
  bucketSeconds: number;
  succeeded: number;
  failed: number;
  rpm: number;
  tpm: number;
  tokens: number;
  cost: number;
  cacheHitTokens: number;
  cacheHitRate: number | null;
};

export type RequestLogAnalytics = {
  requestCount: number;
  failureCount: number;
  failureRate: number | null;
  peakRpm: number;
  peakTpm: number;
  totalTokens: number;
  totalCost: number;
  cacheHitTokens: number;
  cacheHitRate: number | null;
  series: RequestLogAnalyticsPoint[];
};

export type AccountActivityType = "management" | "system" | "login";

export type AccountActivityRecord = {
  id: string;
  eventId: string | null;
  type: AccountActivityType;
  createdAt: number;
  content: string | null;
  action: string | null;
  parameters: Record<string, unknown> | null;
  sourceIp: string | null;
  loginMethod: string | null;
  userAgent: string | null;
};

export type AccountActivityListInput = PaginationInput & {
  range: DateRangeValue;
  type: "all" | AccountActivityType;
};

export type IntegrationData = {
  baseUrl: string;
  apiVersion: string | null;
  region: string | null;
  serviceStatus: "reachable";
  endpoints: Array<{
    name: string;
    method: "GET" | "POST";
    path: string;
    description: string;
  }>;
};

export type AlertRule = {
  id: string;
  type: "balance" | "spend" | "error_rate" | "latency";
  name: string;
  threshold: number | null;
  channel: NotificationChannel | null;
  enabled: boolean | null;
  lastTriggeredAt: number | null;
};

export type PlatformMonitor = {
  id: string;
  group: string;
  name: string;
  status: "operational" | "degraded" | "outage" | "unknown";
  uptimePercent: number | null;
};

export type AlertCenterData = {
  rules: AlertRule[];
  platform: {
    configured: boolean | null;
    monitors: PlatformMonitor[];
    status: "operational" | "degraded" | "outage" | "unconfigured" | "unknown";
    uptimePercent: number | null;
  };
  incidents: Array<{
    id: string;
    title: string;
    status: "monitoring" | "resolved";
    startedAt: number;
    resolvedAt: number | null;
  }>;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "developer" | "billing" | "viewer";
  status: "active" | "invited";
  lastActiveAt: number | null;
};

export type TaskStatus =
  | "queued"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "unknown";

export type TaskType = "image" | "video" | "audio" | "unknown";

export type TaskMetadata = {
  durationSeconds: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  outputCount: number | null;
  quality: string | null;
  voice: string | null;
  format: string | null;
};

export type TaskRecord = {
  id: string;
  type: TaskType;
  model: string | null;
  prompt: string;
  platform: string | null;
  action: string | null;
  status: TaskStatus;
  progress: number | null;
  createdAt: number;
  startedAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  failureReason: string | null;
  resultUrl: string | null;
  cost: number;
  costUnit: "usd";
  metadata: TaskMetadata;
};

export type TaskListInput = PaginationInput & {
  range: DateRangeValue;
  status: "all" | Exclude<TaskStatus, "unknown">;
  type: "all" | Exclude<TaskType, "unknown">;
};

export type TaskTypeCounts = Record<"all" | Exclude<TaskType, "unknown">, number>;

export type BillingTransaction = {
  id: string;
  type: "topup" | "redeem" | "usage" | "subscription";
  amount: number;
  status: "completed" | "pending" | "failed";
  createdAt: number;
  description: string | null;
};

export type BillingTransactionListInput = PaginationInput & {
  keyword: string;
  range: DateRangeValue;
  status: "all" | BillingTransaction["status"];
  type: "all" | Extract<BillingTransaction["type"], "topup" | "subscription">;
};

export type BillingLedgerEntryType = "topup" | "refund";

export type BillingLedgerEntry = {
  id: string;
  eventId: string | null;
  type: BillingLedgerEntryType;
  createdAt: number;
  content: string | null;
  sourceIp: string | null;
  amountUsd: number | null;
  model: string | null;
  apiKeyName: string | null;
  taskId: string | null;
};

export type BillingLedgerListInput = PaginationInput & {
  range: DateRangeValue;
  type: "all" | BillingLedgerEntryType;
};

export type SubscriptionPlan = {
  id: number;
  name: string;
  price: number;
  currency: string;
  interval: "custom" | "day" | "hour" | "month" | "year";
  durationUnit: "custom" | "day" | "hour" | "month" | "year";
  durationValue: number;
  quotaUsd: number;
  unlimitedQuota: boolean;
  quotaResetPeriod: string;
  features: string[];
  current: boolean;
  purchaseCount: number;
  purchaseLimit: number;
  paymentMethods: SubscriptionPaymentMethod[];
};

export type SubscriptionPaymentMethod = {
  id: string;
  name: string;
  type: "balance" | "creem" | "epay" | "stripe" | "waffo_pancake";
  paymentMethod?: string;
};

export type BillingData = {
  balance: number;
  totalUsage: number;
  monthSpend: number | null;
  pendingAmount: number | null;
  currency: string;
  transactions: BillingTransaction[];
  plans: SubscriptionPlan[];
};

export type RechargeDisplayType = "USD" | "CNY" | "TOKENS";

export type RechargePaymentMethod = {
  id: string;
  name: string;
  type: string;
  minAmount: number;
  icon?: string;
  paymentMethodIndex?: number;
};

export type RechargeProduct = {
  id: string;
  name: string;
  price: number;
  creditUsd: number;
  currency: "USD" | "EUR";
};

export type RechargeConfiguration = {
  amountOptions: number[];
  complianceConfirmed: boolean;
  customCurrencySymbol: string;
  discounts: Record<string, number>;
  displayType: RechargeDisplayType;
  externalTopupUrl: string | null;
  onlineEnabled: boolean;
  paymentCurrency: string;
  paymentMethods: RechargePaymentMethod[];
  products: RechargeProduct[];
  quotaPerUnit: number;
  redemptionEnabled: boolean;
  usdExchangeRate: number;
};

export type RechargeQuoteInput = {
  amount: number;
  currency: string;
  paymentMethod: RechargePaymentMethod;
};

export type RechargeQuote = {
  amount: number;
  currency: string;
};

export type CreateRechargeCheckoutInput = {
  amount: number;
  paymentMethod?: RechargePaymentMethod;
  product?: RechargeProduct;
};

export type RechargeCheckout =
  | { kind: "redirect"; orderId?: string; url: string }
  | {
      fields: Record<string, string>;
      kind: "form";
      orderId?: string;
      url: string;
    }
  | { kind: "demo" };

export type PurchaseSubscriptionInput = {
  method: SubscriptionPaymentMethod;
  planId: number;
};

export type SubscriptionCheckout = RechargeCheckout | { kind: "completed" };

export type PaymentConfirmationInput = {
  kind: "subscription" | "topup";
  orderId?: string;
  planId?: number;
};

export type PaymentConfirmationStatus = "completed" | "failed" | "pending";

export type NotificationChannel = "bark" | "email" | "gotify" | "webhook";

export type AccountPreferences = {
  balanceWarningThresholdUsd: number | null;
  barkUrl: string;
  gotifyPriority: number;
  gotifyToken: string;
  gotifyTokenConfigured: boolean;
  gotifyUrl: string;
  notificationEmail: string;
  recordIpForced: boolean;
  recordIpLog: boolean;
  notifyType: NotificationChannel | null;
  webhookSecret: string;
  webhookSecretConfigured: boolean;
  webhookUrl: string;
};

export type LoginSessionRecord = {
  id: string;
  current: boolean;
  method: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  lastActiveAt: number;
  expiresAt: number;
};

export type AccountData = {
  user: ConsoleUser;
  preferences: AccountPreferences;
  security: {
    backupCodesRemaining: number | null;
    passkeyEnabled: boolean;
    passkeyLastUsedAt: number | null;
    twoFactorEnabled: boolean;
    twoFactorLocked: boolean;
    emailBound: boolean;
    evmWalletAddress: string | null;
    evmWalletEnabled: boolean;
    evmWalletLastUsedAt: number | null;
    evmWalletRemovable: boolean;
    evmWalletVerificationMethod: "2fa" | "passkey" | "password" | null;
  };
  sessions: LoginSessionRecord[];
};

export type TwoFactorSetup = {
  backupCodes: string[];
  qrCodeData: string;
  secret: string;
};

export type AccountSecurityResult = {
  account: AccountData;
  session: ConsoleSession;
};

export type RevokeOtherSessionsResult = {
  account: AccountData;
  revokedCount: number;
};

export type TwoFactorBackupCodesResult = AccountSecurityResult & {
  backupCodes: string[];
};

export type UpdateProfileInput = {
  username: string;
  displayName: string;
  email: string;
  verificationCode?: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type SetPasswordWithEVMWalletInput = EVMWalletAuthCompleteInput & {
  newPassword: string;
};

export type ConsoleRepository = {
  mode: ConsoleDataMode;
  getAuthCapabilities(): Promise<AuthCapabilities>;
  createOAuthLoginFlow(provider: string): Promise<OAuthLoginFlow>;
  completeOAuthLogin(input: OAuthCallbackInput): Promise<ConsoleSession>;
  register(input: RegisterInput): Promise<void>;
  sendEmailVerification(input: EmailVerificationInput): Promise<void>;
  requestPasswordReset(input: PasswordResetRequestInput): Promise<void>;
  confirmPasswordReset(input: PasswordResetConfirmInput): Promise<string>;
  getSession(options?: {
    ignoreCurrentSession?: boolean;
    signal?: AbortSignal;
  }): Promise<ConsoleSession | null>;
  signIn(input: SignInInput): Promise<SignInResult>;
  verifyTwoFactorLogin(input: VerifyTwoFactorLoginInput): Promise<ConsoleSession>;
  signInWithPasskey(): Promise<ConsoleSession | null>;
  beginEVMWalletAuth(input: EVMWalletAuthBeginInput): Promise<EVMWalletAuthChallenge>;
  completeEVMWalletAuth(input: EVMWalletAuthCompleteInput): Promise<ConsoleSession>;
  clearLocalSession(): void;
  signOut(session: ConsoleSession | null): Promise<void>;
  getOverview(range: DateRangeValue): Promise<OverviewData>;
  getOnboarding(): Promise<OnboardingData>;
  listApiKeys(): Promise<ApiKeyRecord[]>;
  getApiKeysPage(input: ApiKeyListInput): Promise<PaginatedResult<ApiKeyRecord>>;
  listApiKeyGroups(): Promise<ApiKeyGroupOption[]>;
  createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  updateApiKey(input: UpdateApiKeyInput): Promise<ApiKeyRecord>;
  setApiKeyEnabled(id: number, enabled: boolean): Promise<ApiKeyRecord>;
  revokeApiKey(id: number): Promise<void>;
  listPlaygroundModels(group: string): Promise<PlaygroundModel[]>;
  sendPlaygroundMessage(
    input: PlaygroundMessageInput,
    signal?: AbortSignal,
  ): Promise<PlaygroundReply>;
  getUsage(range: DateRangeValue): Promise<UsageData>;
  getIntegration(): Promise<IntegrationData>;
  listModelCatalog(group: string): Promise<ModelCatalogItem[]>;
  getRequestLogsPage(input: RequestLogListInput): Promise<PaginatedResult<RequestLogRecord>>;
  getRequestLogAnalytics(input: RequestLogAnalyticsInput): Promise<RequestLogAnalytics>;
  getRequestLog(requestId: string): Promise<RequestLogRecord>;
  getAccountActivityPage(
    input: AccountActivityListInput,
  ): Promise<PaginatedResult<AccountActivityRecord>>;
  getAlertCenter(): Promise<AlertCenterData>;
  listTeamMembers(): Promise<TeamMember[]>;
  getTasksPage(input: TaskListInput): Promise<PaginatedResult<TaskRecord>>;
  getTaskTypeCounts(
    input: Omit<TaskListInput, "page" | "pageSize" | "type">,
  ): Promise<TaskTypeCounts>;
  getBilling(): Promise<BillingData>;
  getBillingTransactionsPage(
    input: BillingTransactionListInput,
  ): Promise<PaginatedResult<BillingTransaction>>;
  getBillingLedgerPage(input: BillingLedgerListInput): Promise<PaginatedResult<BillingLedgerEntry>>;
  redeemCode(code: string): Promise<BillingData>;
  getRechargeConfiguration(): Promise<RechargeConfiguration>;
  getRechargeQuote(input: RechargeQuoteInput): Promise<RechargeQuote>;
  createRechargeCheckout(input: CreateRechargeCheckoutInput): Promise<RechargeCheckout>;
  purchaseSubscription(input: PurchaseSubscriptionInput): Promise<SubscriptionCheckout>;
  getPaymentConfirmation(
    input: PaymentConfirmationInput,
    signal?: AbortSignal,
  ): Promise<PaymentConfirmationStatus>;
  getAccount(): Promise<AccountData>;
  updateProfile(input: UpdateProfileInput): Promise<AccountData>;
  changePassword(input: ChangePasswordInput): Promise<AccountSecurityResult>;
  beginEVMWalletPasswordSetup(input: {
    address: string;
    chainId: number;
  }): Promise<EVMWalletAuthChallenge>;
  completeEVMWalletPasswordSetup(
    input: SetPasswordWithEVMWalletInput,
  ): Promise<AccountSecurityResult>;
  updatePreferences(input: AccountPreferences): Promise<AccountData>;
  revokeSession(id: string): Promise<AccountData>;
  revokeOtherSessions(): Promise<RevokeOtherSessionsResult>;
  setupTwoFactor(): Promise<TwoFactorSetup>;
  enableTwoFactor(code: string): Promise<AccountSecurityResult>;
  disableTwoFactor(code: string): Promise<AccountSecurityResult>;
  regenerateTwoFactorBackupCodes(code: string): Promise<TwoFactorBackupCodesResult>;
  registerPasskey(twoFactorCode?: string): Promise<AccountSecurityResult>;
  removePasskey(twoFactorCode?: string): Promise<AccountSecurityResult>;
  beginEVMWalletBinding(input: {
    address: string;
    chainId: number;
    proof?: string;
  }): Promise<EVMWalletAuthChallenge>;
  completeEVMWalletBinding(
    input: EVMWalletAuthCompleteInput & { proof?: string },
  ): Promise<AccountSecurityResult>;
  removeEVMWallet(proof?: string): Promise<AccountSecurityResult>;
  createEVMWalletSecurityProof(
    method: "2fa" | "passkey" | "password",
    scope: "evm_wallet.bind" | "evm_wallet.delete",
    code?: string,
  ): Promise<string>;
};
