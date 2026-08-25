/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export type ChannelModel = {
  id: number
  channel_id: number
  channel_name: string
  model_id: number
  model_name: string
  currency: string
  upstream_model_name: string
  status: number
  routing_enabled: boolean
  priority: number
  weight: number
  region: string
  active_purchase_price_version_id: number
  active_purchase_price_version: number
  purchase_pricing_mode: string
  purchase_discount: string
}

export type ChannelModelListResponse = {
  success: boolean
  message?: string
  data: {
    items: ChannelModel[]
    total: number
    page: number
    page_size: number
  }
}

export type PricingRuntimeStatus = {
  total_channel_models: number
  priced_channel_models: number
  complete_group_model_scopes: number
  live_traffic_enabled: boolean
  distributed_circuit_state: boolean
  toc_default_ready?: boolean
  toc_default_error?: string
  route_score_weights: {
    cost: number
    success: number
    latency: number
    quality: number
  }
}

export type ChannelCircuitStatus = {
  channel_id: number
  channel_name: string
  model_id: number
  model_name: string
  state: 'monitoring' | 'open' | 'half_open'
  consecutive_failures: number
  open_until: number
  probe_until: number
  success_count: number
  failure_count: number
  success_rate: number
  average_latency_ms: number
}

export type ChannelCircuitEvent = {
  id: number
  channel_id: number
  channel_name: string
  model_id?: number
  model_name?: string
  event:
    | 'failure'
    | 'opened'
    | 'rate_limited'
    | 'half_open_probe'
    | 'recovered'
    | 'manual_reset'
  status_code: number
  occurred_at: number
}

export type ChannelCircuitOverview = {
  channels: ChannelCircuitStatus[]
  events: ChannelCircuitEvent[]
  distributed: boolean
}

export type ChannelCircuitEventListResponse = {
  success: boolean
  message?: string
  data: {
    items: ChannelCircuitEvent[]
    total: number
    page: number
    page_size: number
  }
}

export type RequestPricingSnapshot = {
  id: number
  request_id: string
  upstream_request_id?: string
  model_name: string
  channel_id: number
  channel_name: string
  billing_mode: string
  purchase_price_version_id?: number
  sales_price_book_id?: number
  sales_price_book_version_id?: number
  sales_price_book_item_id?: number
  estimated_usage?: string
  actual_usage?: string
  reserved_quota: number
  actual_pre_consumed_quota?: number
  token_pre_consumed_quota?: number
  pre_consume_captured?: boolean
  token_id?: number
  settled_quota: number
  purchase_cost: string
  provider_reported_cost?: string
  provider_cost_known?: boolean
  provider_cost_scope?: 'full_provider_cost' | 'platform_fee_only'
  provider_cost_mode?:
    | 'estimated'
    | 'response_reported'
    | 'provider_api'
    | 'invoice'
    | 'manual'
  provider_cost_status?:
    | 'estimated'
    | 'pending'
    | 'confirmed'
    | 'reconciled'
    | 'failed'
  provider_cost_source?:
    | 'response'
    | 'task_response'
    | 'provider_api'
    | 'invoice'
    | 'manual'
    | 'legacy'
  provider_cost_confirmed_at?: number
  cost_variance?: string
  gross_margin?: string
  gross_margin_known?: boolean
  sales_amount: string
  base_sales_amount?: string
  estimated_customer_charge?: string
  customer_charge?: string | null
  applied_group?: string
  quota_per_unit?: string
  total_variable_cost_rate?: string
  effective_tax_rate?: string
  minimum_margin_rate?: string
  net_margin_rate?: string
  margin_compliant?: boolean
  billing_source?: 'wallet' | 'subscription'
  subscription_id?: number
  currency: string
  status: 'reserved' | 'pending' | 'settled' | 'refunded' | 'archived'
  failure_code?: string
  failure_reason?: string
  resolution?:
    | ''
    | 'automatic_refund'
    | 'automatic_no_charge'
    | 'admin_confirmed_refund'
    | 'legacy_evidence_unavailable'
  resolved_at?: number
  resolved_by?: number
  updated_at: number
  created_at?: number
}

export type RequestPricingSnapshotListResponse = {
  success: boolean
  message?: string
  data: {
    items: RequestPricingSnapshot[]
    total: number
    page: number
    page_size: number
  }
}

export type PricingReconciliationSummary = {
  pending: number
  stale_reserved: number
  settled_last_24h: number
  refunded_last_24h: number
  archived_last_24h?: number
  manual_review?: number
  oldest_anomaly_created_at: number
}

export type PricingFinancialSummary = {
  settled_count: number
  refunded_count?: number
  finalized_count?: number
  revenue_usd: string
  billed_amount_usd?: string
  estimated_purchase_usd: string
  refunded_estimated_purchase_usd?: string
  provider_reported_cost_usd: string
  cost_variance_usd: string
  gross_margin_usd: string
  provider_cost_known_count: number
  provider_cost_missing_count: number
  provider_cost_estimated_count?: number
  provider_cost_pending_count?: number
  provider_cost_confirmed_count?: number
  provider_cost_reconciled_count?: number
  provider_cost_failed_count?: number
  customer_charge_known_count?: number
  customer_charge_missing_count?: number
  full_provider_cost_count: number
  gross_margin_known_count?: number
  gross_margin_missing_count?: number
  margin_breach_count?: number
}

export type ImportResult = {
  created: number
  updated?: number
  skipped_existing?: number
  skipped_unknown?: number
  unknown_model_names?: string[]
  skipped_unpriced?: number
}

export type ImportResponse = {
  success: boolean
  message?: string
  data: ImportResult
}

export type PublishLatestOfficialPriceDraftsResponse = {
  success: boolean
  message?: string
  data: {
    published: number
    skipped_unsupported: number
  }
}

export type PriceVersionStatus = 'draft' | 'active' | 'suspended' | 'expired'

export type OfficialPriceVersion = {
  id: number
  model_id: number
  billing_mode: string
  price_structure: string
  price_components: string
  billing_expr: string
  expr_hash?: string
  expression_source?: string
  expression_schema_version?: string
  currency: string
  region?: string
  version: number
  status: PriceVersionStatus
  source: string
  source_url?: string
  source_version?: string
  source_updated_at?: number
  remark: string
  created_at?: number
  updated_at?: number
  effective_from: number
  effective_to: number
}

export type OfficialPriceOverview = {
  model_id: number
  model_name: string
  status: PriceVersionStatus | 'unconfigured'
  currency: string
  billing_mode: string
  price_structure: string
  version: number
  version_count: number
  draft_count: number
  latest_draft_id: number
  effective_from: number
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  image_input_unit_price: string
  image_output_unit_price: string
  audio_input_unit_price: string
  audio_output_unit_price: string
  request_unit_price: string
  video_second_unit_price: string
}

export type PurchasePriceVersion = {
  id: number
  channel_model_id: number
  official_price_version_id?: number
  pricing_mode: string
  billing_mode: string
  price_structure: string
  price_components: string
  quote_spec?: string
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  currency: string
  version: number
  status: PriceVersionStatus
  purchase_discount: string
  purchase_billing_expr: string
  expression_source: string
  expression_schema_version: string
  price_unit: string
  quote_reference: string
  quote_valid_until?: number
  contract_reference: string
  contract_effective_from?: number
  contract_effective_to?: number
  conditions: string
  remark: string
  effective_from: number
  effective_to: number
  created_at?: number
  updated_at?: number
}

export type PurchasePriceSuspendImpact = {
  model_id: number
  remaining_candidate_count: number
  affected_price_book_count: number
  affected_assignment_count: number
  affects_toc_default: boolean
}

export type PriceVersionResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type AutomatedPriceDraftResult = {
  batch_id: number
  status: string
  channel_model_id?: number
  purchase_price_version_id?: number
  price_book_id?: number
  price_book_version_id?: number
  error_message?: string
}

export type FlatTokenPrices = {
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  image_input_unit_price: string
  image_output_unit_price: string
  audio_input_unit_price: string
  audio_output_unit_price: string
}

export type PricingCatalogOption = {
  id: number
  name: string
  upstream_model_name?: string
}

export type PricingCatalogOptionsResponse = {
  success: boolean
  data: {
    channels: PricingCatalogOption[]
    models: PricingCatalogOption[]
  }
}
