import type {
  TopupOrderType,
  TopupRecord,
  TopupStatus,
} from '@/features/wallet/types'

export type FinancePeriod = '7d' | '30d' | '90d' | 'all'

export type FinanceBalanceSnapshot = {
  wallet_quota: number
  affiliate_quota: number
  subscription_quota: number
  total_available_quota: number
  negative_wallet_quota: number
  user_count: number
  users_with_balance: number
  unlimited_subscription_count: number
}

export type FinanceOrderSummary = {
  total_count: number
  success_count: number
  pending_count: number
  failed_count: number
  expired_count: number
  success_amount: number
  pending_amount: number
  external_success_count: number
  wallet_success_count: number
  wallet_success_amount: number
  subscription_success_count: number
  subscription_success_amount: number
  internal_subscription_count: number
  internal_subscription_amount: number
}

export type FinanceOrderStatusSummary = {
  status: TopupStatus
  count: number
  amount: number
}

export type FinanceProviderSummary = {
  provider: string
  internal: boolean
  order_count: number
  success_count: number
  success_amount: number
}

export type FinanceRedemptionSummary = {
  available_count: number
  available_quota: number
  redeemed_count: number
  redeemed_quota: number
  expired_count: number
  expired_quota: number
}

export type FinanceOverview = {
  generated_at: number
  period_start: number
  period_end: number
  balance: FinanceBalanceSnapshot
  orders: FinanceOrderSummary
  statuses: FinanceOrderStatusSummary[]
  providers: FinanceProviderSummary[]
  redemptions: FinanceRedemptionSummary
}

export type FinanceOrderFilters = {
  period: FinancePeriod
  keyword?: string
  status?: TopupStatus
  provider?: string
  orderType?: TopupOrderType
}

export type FinanceOrderPage = {
  page: number
  page_size: number
  total: number
  items: TopupRecord[]
}

export type FinanceApiResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type FinanceTrendPoint = {
  bucket_start: number
  total_orders: number
  success_orders: number
  pending_orders: number
  failed_orders: number
  expired_orders: number
  success_amount: number
  consumed_quota: number
  request_count: number
  token_count: number
}

export type FinanceTrendReport = {
  start_at: number
  end_at: number
  interval: 'day'
  points: FinanceTrendPoint[]
}

export type PaymentCallbackStatus =
  | 'received'
  | 'processed'
  | 'rejected'
  | 'failed'

export type PaymentCallbackEvent = {
  id: number
  provider: string
  event_id: string
  event_type: string
  trade_no: string
  request_method: string
  request_path: string
  client_ip: string
  payload_digest: string
  payload_preview: string
  verification_status: 'pending' | 'verified' | 'rejected'
  processing_status: PaymentCallbackStatus
  http_status: number
  error_message: string
  duplicate: boolean
  received_at: number
  completed_at: number
  duration_ms: number
}

export type PaymentCallbackSummary = {
  total_count: number
  processed_count: number
  rejected_count: number
  failed_count: number
  duplicate_count: number
}

export type PaymentCallbackFilters = {
  period: FinancePeriod
  provider?: string
  status?: PaymentCallbackStatus
  keyword?: string
}

export type FinanceUserListItem = {
  id: number
  username: string
  display_name: string
  email: string
  group: string
  wallet_quota: number
  affiliate_quota: number
  used_quota: number
}

export type FinanceUserFundingSummary = {
  successful_order_count: number
  successful_amount: number
  credited_quota: number
  redemption_count: number
  redemption_quota: number
}

export type FinanceUserSubscription = {
  id: number
  plan_id: number
  plan_title: string
  amount_total: number
  amount_used: number
  remaining_quota: number
  unlimited: boolean
  start_time: number
  end_time: number
  status: string
}

export type FinanceUserDetail = {
  user: FinanceUserListItem
  active_subscription_quota: number
  total_available_quota: number
  funding: FinanceUserFundingSummary
  subscriptions: FinanceUserSubscription[]
  recent_orders: TopupRecord[]
}

export type FinanceAlertSeverity = 'critical' | 'warning' | 'info'
export type FinanceAlertStatus = 'open' | 'acknowledged' | 'resolved'
export type FinanceAlertSource =
  | 'payment_callback'
  | 'user_balance'
  | 'recharge_order'

export type FinanceAlert = {
  id: number
  fingerprint: string
  code: string
  source: FinanceAlertSource
  severity: FinanceAlertSeverity
  status: FinanceAlertStatus
  title: string
  message: string
  entity_type: string
  entity_id: string
  details: string
  occurrence_count: number
  first_observed_at: number
  last_observed_at: number
  acknowledged_at: number
  acknowledged_by: number
  resolved_at: number
  resolved_by: number
  resolution_note: string
}

export type FinanceAlertSummary = {
  open_count: number
  critical_open_count: number
  warning_open_count: number
  acknowledged_count: number
}

export type FinanceAlertFilters = {
  status?: FinanceAlertStatus
  severity?: FinanceAlertSeverity
  source?: FinanceAlertSource
  keyword?: string
}

export type FinanceAlertScanResult = {
  negative_balance_count: number
  stale_pending_count: number
  incomplete_order_count: number
  stale_callback_count: number
}

export type FinancePage<T> = {
  page: number
  page_size: number
  total: number
  items: T[]
}
