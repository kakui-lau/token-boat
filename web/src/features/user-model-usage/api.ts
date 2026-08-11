/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type { UserModelUsageFilters, UserModelUsageResponse } from './types'

export async function getUserModelUsage(
  filters: UserModelUsageFilters
): Promise<UserModelUsageResponse> {
  const response = await api.get<UserModelUsageResponse>(
    '/api/log/user-model-usage',
    { params: filters }
  )
  return response.data
}
