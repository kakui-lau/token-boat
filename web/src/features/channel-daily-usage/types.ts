/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type ChannelDailyUsage = {
  id: number
  usage_date: string
  timezone: string
  channel_id: number
  channel_name: string
  model_name: string
  upstream_model: string
  billed_request_count: number
  prompt_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  completion_tokens: number
  total_tokens: number
  customer_quota: number
  customer_revenue_usd: string
  provider_reported_cost_usd: string
  provider_cost_known_count: number
  missing_usage_count: number
  pending_task_count: number
  manual_review_count: number
  status: string
}

export type ChannelUsageSortBy =
  | 'usage_date'
  | 'channel_name'
  | 'model_name'
  | 'upstream_model'
  | 'billed_request_count'
  | 'prompt_tokens'
  | 'cache_read_tokens'
  | 'cache_write_tokens'
  | 'completion_tokens'
  | 'total_tokens'
  | 'customer_revenue_usd'
  | 'provider_reported_cost_usd'
  | 'cost_coverage'
  | 'exceptions'

export type ChannelUsageSortOrder = 'asc' | 'desc'

export type ChannelDailyUsageFilters = {
  start_date: string
  end_date: string
  granularity: 'day' | 'month'
  channel_id?: number
  model_name?: string
  upstream_model?: string
  status?: 'open' | 'locked'
  sort_by: ChannelUsageSortBy
  sort_order: ChannelUsageSortOrder
  page: number
  page_size: number
}

export type ChannelDailyUsageMonth = {
  month: string
  timezone: 'UTC'
  status: 'open' | 'locked'
  locked_at: number
  locked_by: number
}

export type ChannelDailyUsageSummary = {
  last_calculated_at: number
  billed_request_count: number
  prompt_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  completion_tokens: number
  total_tokens: number
  customer_quota: number
  customer_revenue_usd: string
  provider_reported_cost_usd: string
  provider_cost_known_count: number
  missing_usage_count: number
  pending_task_count: number
  manual_review_count: number
}

export type ChannelDailyUsageFilterOptions = {
  channels: {
    channel_id: number
    channel_name: string
  }[]
  model_names: string[]
  upstream_models: string[]
}

export type ChannelDailyUsageList = {
  items: ChannelDailyUsage[]
  total: number
}

export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
}
