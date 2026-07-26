/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type {
  ApiEnvelope,
  ChannelDailyUsageFilters,
  ChannelDailyUsageList,
  ChannelDailyUsageSummary,
} from './types'

export async function getChannelDailyUsages(
  filters: ChannelDailyUsageFilters
): Promise<ApiEnvelope<ChannelDailyUsageList>> {
  const response = await api.get('/api/channel-daily-usages', {
    params: { ...filters, p: filters.page, page: undefined },
  })
  return response.data
}

export async function getChannelDailyUsageSummary(
  filters: ChannelDailyUsageFilters
): Promise<ApiEnvelope<ChannelDailyUsageSummary>> {
  const response = await api.get('/api/channel-daily-usages/summary', {
    params: filters,
  })
  return response.data
}

export async function exportChannelDailyUsages(
  filters: ChannelDailyUsageFilters
): Promise<Blob> {
  const response = await api.get('/api/channel-daily-usages/export', {
    params: filters,
    responseType: 'blob',
  })
  return response.data
}

export async function recalculateChannelDailyUsages(data: {
  start_date: string
  end_date: string
  timezone: 'UTC'
}): Promise<ApiEnvelope<unknown>> {
  const response = await api.post('/api/channel-daily-usages/recalculate', data)
  return response.data
}

export async function lockChannelDailyUsageMonth(data: {
  start_date: string
  end_date: string
  timezone: 'UTC'
}): Promise<ApiEnvelope<unknown>> {
  const response = await api.post('/api/channel-daily-usages/lock', data)
  return response.data
}

export async function unlockChannelDailyUsageMonth(data: {
  start_date: string
  end_date: string
  timezone: 'UTC'
}): Promise<ApiEnvelope<unknown>> {
  const response = await api.post('/api/channel-daily-usages/unlock', data)
  return response.data
}
