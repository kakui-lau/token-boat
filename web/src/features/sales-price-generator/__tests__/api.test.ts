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
  exportGeneratedSalesPrices,
  generateSalesPrices,
  getSupportedChannelModels,
} from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const rates = {
  total_variable_cost_rate: '0.11',
  effective_tax_rate: '0.16',
  target_net_margin: '0.03',
  channel_model_ids: [11, 12],
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('loads supported channel models with 200 rows per page', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true } })

  await getSupportedChannelModels({
    keyword: 'gemini',
    channel_id: 12,
    routing_status: 'available',
    runtime_mode: 'v2',
    retail_status: 'published',
    page: 2,
    page_size: 200,
  })

  expect(api.get).toHaveBeenCalledWith(
    '/api/pricing-admin/sales-price-generator/channel-models',
    {
      params: {
        keyword: 'gemini',
        channel_id: 12,
        routing_status: 'available',
        runtime_mode: 'v2',
        retail_status: 'published',
        page: 2,
        page_size: 200,
      },
    }
  )
})

test('posts the configured rates and active filters to generation and export endpoints', async () => {
  vi.mocked(api.post)
    .mockResolvedValueOnce({ data: { success: true } })
    .mockResolvedValueOnce({ data: new Blob(['generated prices']) })
  const filters = {
    keyword: 'gemini',
    channel_id: 12,
    routing_status: 'available' as const,
    runtime_mode: 'v2' as const,
  }

  await generateSalesPrices(rates, filters)
  await exportGeneratedSalesPrices(rates, filters)

  expect(api.post).toHaveBeenNthCalledWith(
    1,
    '/api/pricing-admin/sales-price-generator/generate',
    rates,
    { params: filters }
  )
  expect(api.post).toHaveBeenNthCalledWith(
    2,
    '/api/pricing-admin/sales-price-generator/export',
    rates,
    { params: filters, responseType: 'blob' }
  )
})
