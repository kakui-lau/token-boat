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
  assignUserPriceBook,
  compareSalesPriceBookVersions,
  createSalesPriceBookVersion,
  exportSalesPriceBookItems,
  generateSalesPriceBookItems,
  getSalesPriceBooks,
  getPricingChangeBatch,
  getPricingChangeBatches,
  getUserPriceBookAssignments,
  setDefaultSalesPriceBook,
} from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { items: [], total: 0, page: 1, page_size: 200 },
    },
  })
  vi.mocked(api.post).mockResolvedValue({ data: { success: true, data: {} } })
  vi.mocked(api.put).mockResolvedValue({ data: { success: true, data: null } })
})

test('lists price books and user assignments with server pagination filters', async () => {
  await getSalesPriceBooks({
    keyword: 'enterprise',
    audience: 'tob',
    status: 'enabled',
    p: 2,
    page_size: 200,
  })
  await getUserPriceBookAssignments({
    keyword: 'acme',
    status: 'active',
    p: 1,
    page_size: 50,
  })

  expect(api.get).toHaveBeenNthCalledWith(1, '/api/pricing-admin/price-books', {
    params: {
      keyword: 'enterprise',
      audience: 'tob',
      status: 'enabled',
      p: 2,
      page_size: 200,
    },
  })
  expect(api.get).toHaveBeenNthCalledWith(
    2,
    '/api/pricing-admin/user-price-book-assignments',
    {
      params: {
        keyword: 'acme',
        status: 'active',
        p: 1,
        page_size: 50,
      },
    }
  )
})

test('exports every model price item from the selected immutable version', async () => {
  const blob = new Blob(['model'])
  vi.mocked(api.get).mockResolvedValueOnce({ data: blob })

  await exportSalesPriceBookItems(31)

  expect(api.get).toHaveBeenCalledWith(
    '/api/pricing-admin/price-book-versions/31/items/export',
    { responseType: 'blob' }
  )
})

test('compares the selected version with an explicit base version', async () => {
  await compareSalesPriceBookVersions(12, 18)

  expect(api.get).toHaveBeenCalledWith(
    '/api/pricing-admin/price-book-versions/18/diff',
    { params: { base_version_id: 12 } }
  )
})

test('lists pricing change batches and loads the selected batch details', async () => {
  await getPricingChangeBatches({
    keyword: 'PB-12',
    status: 'review_required',
    trigger_type: 'purchase_price_publish',
    p: 1,
    page_size: 200,
  })
  await getPricingChangeBatch(72)

  expect(api.get).toHaveBeenNthCalledWith(
    1,
    '/api/pricing-admin/pricing-change-batches',
    {
      params: {
        keyword: 'PB-12',
        status: 'review_required',
        trigger_type: 'purchase_price_publish',
        p: 1,
        page_size: 200,
      },
    }
  )
  expect(api.get).toHaveBeenNthCalledWith(
    2,
    '/api/pricing-admin/pricing-change-batches/72'
  )
})

test('creates an immutable price book draft with the exact cost breakdown', async () => {
  const input = {
    cost_basis_strategy: 'max_eligible_cost',
    reprice_mode: 'review',
    payment_fee_rate: '0.04',
    distribution_fee_rate: '0.05',
    operations_labor_rate: '0.02',
    total_variable_cost_rate: '0.11',
    effective_tax_rate: '0.16',
    target_net_margin: '0.03',
    minimum_margin_rate: '0.02',
    rounding_mode: 'ceil',
    rounding_scale: 5,
    risk_action: 'exclude_channel',
    remark: '',
  }

  await createSalesPriceBookVersion(17, input)

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/price-books/17/versions',
    input
  )
})

test('generates only selected channel models with an idempotency key', async () => {
  const input = {
    channel_model_ids: [101, 102, 205],
    idempotency_key: 'price-book-draft-17-selection-1',
  }

  await generateSalesPriceBookItems(31, input)

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/price-book-versions/31/generate-items',
    input
  )
})

test('binds a user directly to a price book and updates the TOC default separately', async () => {
  const assignment = {
    user_id: 9001,
    price_book_id: 17,
    version_policy: 'pin_version' as const,
    pinned_version_id: 31,
    contract_reference: 'CONTRACT-2026-001',
  }

  await assignUserPriceBook(assignment)
  await setDefaultSalesPriceBook(19)

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/user-price-book-assignments',
    assignment
  )
  expect(api.put).toHaveBeenCalledWith(
    '/api/pricing-admin/price-book-defaults',
    { default_key: 'toc_default', price_book_id: 19 }
  )
})
