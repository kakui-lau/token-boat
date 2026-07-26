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
  ChannelMonthlyUsageFilters,
  ChannelMonthlyUsageList,
  ChannelOption,
} from './types'

export async function getChannelMonthlyUsages(
  filters: ChannelMonthlyUsageFilters
): Promise<ApiEnvelope<ChannelMonthlyUsageList>> {
  const response = await api.get('/api/channel-daily-usages/monthly-summary', {
    params: { ...filters, p: filters.page, page: undefined },
  })
  return response.data
}

export async function getChannelMonthlyUsageChannels(filters: {
  start_date: string
  end_date: string
}): Promise<ApiEnvelope<{ channels: ChannelOption[] }>> {
  const response = await api.get('/api/channel-daily-usages/filter-options', {
    params: filters,
  })
  return response.data
}
