import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  createPurchaseDraft,
  exportSelectedChannelModelPrices,
  exportSelectedPricingComparison,
  exportSelectedPurchaseDiscounts,
  getActivePriceBundle,
  getChannelModels,
} from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.post).mockReset()
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: null },
  })
})

test('loads an incomplete active price chain without a global error toast', async () => {
  await getActivePriceBundle(31)

  expect(api.get).toHaveBeenCalledWith(
    '/api/pricing-admin/active-price-bundle',
    {
      params: { channel_model_id: 31 },
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
})

test('sends common channel pricing filters to the list endpoint', async () => {
  await getChannelModels({
    keyword: 'gpt',
    channel_id: 12,
    status: 1,
    runtime_mode: 'v2',
    page: 2,
    page_size: 50,
  })

  expect(api.get).toHaveBeenCalledWith('/api/pricing-admin/channel-models', {
    params: {
      keyword: 'gpt',
      channel_id: 12,
      status: 1,
      runtime_mode: 'v2',
      page: 2,
      page_size: 50,
    },
  })
})

test('posts selected channel model ids to the channel pricing export', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: new Blob(['pricing']) })

  await exportSelectedChannelModelPrices([12, 34])

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/channel-models/export-selected',
    { channel_model_ids: [12, 34] },
    { responseType: 'blob' }
  )
})

test('posts selected channel model ids to the purchase discount export', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: new Blob(['discounts']) })

  await exportSelectedPurchaseDiscounts([12, 34])

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/channel-models/export-selected-purchase-discounts',
    { channel_model_ids: [12, 34] },
    { responseType: 'blob' }
  )
})

test('posts selected channel model ids to the pricing comparison export', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: new Blob(['comparison']) })

  await exportSelectedPricingComparison([12, 34])

  expect(api.post).toHaveBeenCalledWith(
    '/api/pricing-admin/channel-models/export-selected-pricing-comparison',
    { channel_model_ids: [12, 34] },
    { responseType: 'blob' }
  )
})

test('does not report a purchase draft as created after a business error', async () => {
  vi.mocked(api.post).mockResolvedValue({
    data: {
      success: false,
      message: 'database rejected an optional price',
    },
  })

  await expect(
    createPurchaseDraft({} as Parameters<typeof createPurchaseDraft>[0])
  ).rejects.toThrow('database rejected an optional price')
})
