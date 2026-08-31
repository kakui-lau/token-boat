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
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ChangeBatchesPanel } from '../components/change-batches-panel'

const getPricingChangeBatches = vi.fn()
const getPricingChangeBatch = vi.fn()
const publishGeneratedPricingChangeBatch = vi.fn()
const reconcilePricingAutomation = vi.fn()

vi.mock('../api', () => ({
  getPricingChangeBatches: (...args: unknown[]) =>
    getPricingChangeBatches(...args),
  getPricingChangeBatch: (...args: unknown[]) => getPricingChangeBatch(...args),
  publishGeneratedPricingChangeBatch: (...args: unknown[]) =>
    publishGeneratedPricingChangeBatch(...args),
  reconcilePricingAutomation: (...args: unknown[]) =>
    reconcilePricingAutomation(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let result = key
      for (const [name, value] of Object.entries(values ?? {})) {
        result = result.replaceAll(`{{${name}}}`, String(value))
      }
      return result
    },
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('loads 200 change batches per page and shows model-level details', async () => {
  getPricingChangeBatches.mockResolvedValue({
    data: {
      items: [
        {
          id: 72,
          batch_no: 'PB-72',
          trigger_type: 'purchase_price_publish',
          status: 'review_required',
          total_count: 1,
          changed_count: 1,
          unchanged_count: 0,
          review_count: 1,
          requested_by: 9,
          requested_by_username: 'pricing-admin',
          created_at: 1,
        },
        {
          id: 73,
          batch_no: 'PB-POLICY-73',
          trigger_type: 'channel_model_policy_change',
          status: 'completed',
          total_count: 1,
          changed_count: 1,
          unchanged_count: 0,
          review_count: 0,
          requested_by: 9,
          requested_by_username: 'pricing-admin',
          created_at: 2,
        },
      ],
      total: 2,
      page: 1,
      page_size: 200,
    },
  })
  getPricingChangeBatch.mockResolvedValue({
    data: {
      batch: { id: 72, batch_no: 'PB-72' },
      items: [
        {
          id: 81,
          model_id: 31,
          model_name: 'openai/test-model',
          target_type: 'sales_price_book_item',
          action: 'update',
          old_reference_price: '1.123456789',
          new_reference_price: '1.23456789',
          old_reference_cost: '0.7123456789',
          new_reference_cost: '0.823456789',
          margin_before: '0.03',
          margin_after: '0.02',
          risk_code: 'below_minimum_margin',
        },
      ],
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ChangeBatchesPanel />
    </QueryClientProvider>
  )

  expect(await screen.findByText('openai/test-model')).toBeInTheDocument()
  await waitFor(() => {
    expect(getPricingChangeBatches).toHaveBeenCalledWith({
      keyword: undefined,
      status: undefined,
      trigger_type: undefined,
      p: 1,
      page_size: 200,
    })
    expect(getPricingChangeBatch).toHaveBeenCalledWith(72)
  })
  expect(screen.getAllByText('pricing-admin')).toHaveLength(2)
  expect(
    screen.getByText('Channel model special parameters changed')
  ).toBeInTheDocument()
  expect(screen.getByText('below_minimum_margin')).toBeInTheDocument()
  expect(screen.getByText('1.1235')).toBeInTheDocument()
  expect(screen.getByText('1.2346')).toBeInTheDocument()
  expect(screen.getByText('0.7123')).toBeInTheDocument()
  expect(screen.getByText('0.8235')).toBeInTheDocument()
  expect(screen.getByText('Total rows: 1')).toBeInTheDocument()
  expect(
    screen.getByText('2 records match the current filters.')
  ).toBeInTheDocument()
})
