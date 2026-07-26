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

export type ChannelDailyUsageFilters = {
  start_date: string
  end_date: string
  channel_id?: number
  model_name?: string
  page: number
  page_size: number
}

export type ChannelDailyUsageSummary = {
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

export type ChannelDailyUsageList = {
  items: ChannelDailyUsage[]
  total: number
}

export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  data: T
}
