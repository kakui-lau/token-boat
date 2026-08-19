/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type ChannelMonthlyUsageGroupBy = 'model_name' | 'upstream_model'

export type ChannelMonthlyUsageFilters = {
  month: string
  group_by: ChannelMonthlyUsageGroupBy
  channel_id?: number
  page: number
  page_size: number
}

export type ChannelMonthlyUsage = {
  month: string
  channel_id: number
  channel_name: string
  model_name?: string
  upstream_model?: string
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

export type ChannelMonthlyUsageList = {
  items: ChannelMonthlyUsage[]
  total: number
  summary: ChannelMonthlyUsageSummary
  month: string
  group_by: ChannelMonthlyUsageGroupBy
}

export type ChannelMonthlyUsageSummary = {
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

export type ChannelOption = {
  channel_id: number
  channel_name: string
}

export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
}
