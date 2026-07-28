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
import { api } from '@/lib/api'

import type { ChannelModelListResponse, ImportResponse } from './types'

export async function getChannelModels(params: {
  keyword?: string
  page?: number
  page_size?: number
}): Promise<ChannelModelListResponse> {
  const response = await api.get('/api/pricing-admin/channel-models', {
    params,
  })
  return response.data
}

export async function syncLegacyChannelModels(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/sync-legacy'
  )
  return response.data
}

export async function importLegacyOfficialPrices(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/official-prices/import-legacy'
  )
  return response.data
}
