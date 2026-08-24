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
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  exportSelectedPurchaseDiscounts,
  getChannelModels,
  syncChannelModels,
} from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { items: [], total: 0 } },
  })
  vi.mocked(api.post).mockResolvedValue({
    data: { success: true, data: { created: 0 } },
  })
})

test('filters channel models by published purchase pricing', async () => {
  await getChannelModels({ purchase_status: 'published', page_size: 200 })
  expect(api.get).toHaveBeenCalledWith('/api/pricing-admin/channel-models', {
    params: { purchase_status: 'published', page_size: 200 },
  })
})

test('synchronizes channel-model inventory through the current endpoint', async () => {
  await syncChannelModels()
  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/channel-models/sync'
  )
})

test('exports selected purchase discounts without a sales-price payload', async () => {
  vi.mocked(api.post).mockResolvedValueOnce({ data: new Blob(['csv']) })
  await exportSelectedPurchaseDiscounts([12, 34])
  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/channel-models/export-selected-purchase-discounts',
    { channel_model_ids: [12, 34] },
    { responseType: 'blob' }
  )
})
