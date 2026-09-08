export const ADMIN_ROLE = 10;

export type AdminPermissionMap = Record<string, Record<string, boolean>>;

export type AdminSession = {
  accessExpiresAt: number;
  accessToken: string;
  user: {
    adminPermissions: AdminPermissionMap;
    displayName: string;
    id: number;
    role: number;
    username: string;
  };
};

export type ChannelStatus = 0 | 1 | 2 | 3;

export type AdminChannel = {
  balanceUsd: number;
  baseUrl: string | null;
  group: string;
  id: number;
  modelCount: number;
  name: string;
  priority: number;
  responseTimeMs: number;
  status: ChannelStatus;
  tag: string | null;
  testTime: number;
  type: number;
  weight: number;
};

export type ChannelStatusFilter = "all" | "disabled" | "enabled";

export type ChannelListInput = {
  keyword: string;
  page: number;
  pageSize: number;
  status: ChannelStatusFilter;
};

export type AdminChannelPage = {
  items: AdminChannel[];
  page: number;
  pageSize: number;
  total: number;
  typeCounts: Record<number, number>;
};

export type ChannelTestResult = {
  durationSeconds: number;
};

export type AdminTimeRange = {
  endTimestamp: number;
  preset: "5m" | "15m" | "30m" | "1h" | "3h" | "6h" | "24h" | "3d" | "7d" | "custom";
  startTimestamp: number;
  timeZone: string;
};

export type AdminRequestStatusFilter = "all" | "failed" | "succeeded";
export type AdminRequestSearchField =
  | "api_key"
  | "model"
  | "request"
  | "service_trace"
  | "username";

export type AdminRequestListInput = {
  keyword: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
  range: AdminTimeRange;
  searchField: AdminRequestSearchField;
  status: AdminRequestStatusFilter;
};

export type AdminRequestLog = {
  apiKeyName: string | null;
  channelId: number | null;
  channelName: string | null;
  costUsd: number | null;
  createdAt: number;
  endpoint: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  firstTokenLatencyMs: number | null;
  group: string | null;
  id: number;
  inputTokens: number;
  isStream: boolean;
  latencyMs: number | null;
  model: string | null;
  outputTokens: number;
  requestId: string;
  serviceTraceId: string | null;
  sourceIp: string | null;
  status: "failed" | "succeeded";
  statusCode: number | null;
  taskId: string | null;
  username: string;
};

export type AdminRequestSummary = {
  cacheHitRate: number | null;
  costUsd: number | null;
  failedCount: number;
  failureRate: number | null;
  peakRpm: number;
  peakTpm: number;
  requestCount: number;
  succeededCount: number;
  totalTokens: number;
};

export type AdminRequestWorkspace = {
  items: AdminRequestLog[];
  page: number;
  pageSize: number;
  summary: AdminRequestSummary;
  total: number;
};

export type AdminTaskStatusFilter =
  | "all"
  | "cancelled"
  | "expired"
  | "failed"
  | "processing"
  | "queued"
  | "succeeded";
export type AdminTaskTypeFilter = "all" | "audio" | "image" | "video";

export type AdminTaskListInput = {
  channelId: string;
  keyword: string;
  order: "asc" | "desc";
  page: number;
  pageSize: number;
  range: AdminTimeRange;
  status: AdminTaskStatusFilter;
  type: AdminTaskTypeFilter;
};

export type AdminTask = {
  action: string | null;
  billing: {
    auditError: string | null;
    auditStatus: string | null;
    refundStatus: string | null;
    refundedUsd: number | null;
    settlementError: string | null;
    settlementStatus: string | null;
    settlementTargetUsd: number | null;
  } | null;
  canFailAndRefund: boolean;
  channelId: number;
  completedAt: number | null;
  costUsd: number | null;
  createdAt: number;
  failureReason: string | null;
  group: string | null;
  id: number;
  model: string | null;
  platform: string | null;
  progress: number | null;
  promptPreview: string | null;
  startedAt: number | null;
  status: AdminTaskStatusFilter | "unknown";
  taskId: string | null;
  type: AdminTaskTypeFilter | "unknown";
  userId: number;
  username: string | null;
};

export type AdminTaskPage = {
  items: AdminTask[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminTaskRefundResult = {
  alreadyRefunded: boolean;
  refundedUsd: number | null;
  taskId: string;
};

export interface AdminRepository {
  getSession(signal?: AbortSignal): Promise<AdminSession | null>;
  listChannels(input: ChannelListInput, signal?: AbortSignal): Promise<AdminChannelPage>;
  getRequestWorkspace(
    input: AdminRequestListInput,
    signal?: AbortSignal,
  ): Promise<AdminRequestWorkspace>;
  listTasks(input: AdminTaskListInput, signal?: AbortSignal): Promise<AdminTaskPage>;
  failAndRefundTask(internalId: number, taskId: string): Promise<AdminTaskRefundResult>;
  setChannelStatus(id: number, status: 1 | 2): Promise<void>;
  testChannel(id: number): Promise<ChannelTestResult>;
}
