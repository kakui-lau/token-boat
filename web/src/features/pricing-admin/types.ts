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
  priority: number
  weight: number
  region: string
  runtime_mode: 'legacy' | 'v2'
  active_retail_price_version_id: number
  active_retail_price_version: number
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
  v2_channel_models: number
  complete_group_model_scopes: number
  live_traffic_enabled: boolean
  distributed_circuit_state: boolean
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
  model_name: string
  channel_id: number
  channel_name: string
  billing_mode: string
  purchase_price_version_id?: number
  retail_price_version_id?: number
  estimated_usage?: string
  actual_usage?: string
  reserved_quota: number
  settled_quota: number
  purchase_cost: string
  provider_reported_cost?: string
  provider_cost_known?: boolean
  provider_cost_scope?: 'full_provider_cost' | 'platform_fee_only'
  cost_variance?: string
  gross_margin?: string
  retail_amount: string
  currency: string
  status: 'reserved' | 'pending' | 'settled' | 'refunded'
  failure_code?: string
  failure_reason?: string
  resolution?: '' | 'automatic_refund' | 'admin_confirmed_refund'
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
  oldest_anomaly_created_at: number
}

export type PricingFinancialSummary = {
  settled_count: number
  revenue_usd: string
  estimated_purchase_usd: string
  provider_reported_cost_usd: string
  cost_variance_usd: string
  gross_margin_usd: string
  provider_cost_known_count: number
  provider_cost_missing_count: number
  full_provider_cost_count: number
}

export type ImportResult = {
  created: number
  updated?: number
  skipped_existing?: number
  skipped_unknown?: number
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
  version: number
  status: PriceVersionStatus
  source: string
  source_version?: string
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
  contract_reference: string
  conditions: string
  remark: string
  effective_from: number
  effective_to: number
  created_at?: number
  updated_at?: number
}

export type RetailPriceVersion = {
  id: number
  channel_model_id: number
  purchase_price_version_id: number
  billing_mode: string
  price_structure: string
  price_components: string
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  currency: string
  version: number
  status: PriceVersionStatus
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  minimum_margin_rate: string
  retail_billing_expr: string
  expression_source: string
  expression_schema_version: string
  price_unit: string
  remark: string
  effective_from: number
  effective_to: number
  created_at?: number
  updated_at?: number
}

export type PriceVersionResponse<T> = {
  success: boolean
  message?: string
  data: T
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

export type PriceSimulationResult = {
  purchase_cost: string
  retail_amount: string
  variable_cost: string
  pre_tax_profit: string
  tax_expense: string
  net_profit: string
  gross_margin_rate: string
  net_margin_rate: string
  minimum_margin_rate: string
  meets_minimum_margin: boolean
  currency: string
  purchase_matched_tier: string
  retail_matched_tier: string
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

export type LowestPriceComponent = {
  unit_price: string
  currency: string
  channel_model_id: number
  channel_name: string
}

export type ModelPriceOverview = {
  model_id: number
  model_name: string
  currency: string
  active_channel_count: number
  input?: LowestPriceComponent
  output?: LowestPriceComponent
  cache_read?: LowestPriceComponent
  cache_write?: LowestPriceComponent
  endpoints: ProviderPriceEndpoint[]
}

export type ProviderPriceEndpoint = {
  channel_model_id: number
  channel_name: string
  upstream_model_name: string
  runtime_mode: 'legacy' | 'v2'
  billing_mode: string
  price_structure: string
  purchase_pricing_mode?: string
  purchase_currency?: string
  purchase_price_components?: string
  purchase_input_unit_price?: string
  purchase_output_unit_price?: string
  retail_price_components?: string
  retail_input_unit_price: string
  retail_output_unit_price: string
  retail_cache_read_unit_price: string
  retail_cache_write_unit_price: string
  target_net_margin?: string
}

export type ActivePriceBundle = {
  channel_model: ChannelModel
  official_price?: OfficialPriceVersion
  purchase_price: PurchasePriceVersion
  retail_price: RetailPriceVersion
  revision: string
}
