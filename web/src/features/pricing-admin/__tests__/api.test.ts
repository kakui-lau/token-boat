import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { createPurchaseDraft, getActivePriceBundle } from '../api'

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

test('does not report a purchase draft as created after a business error', async () => {
  vi.mocked(api.post).mockResolvedValue({
    data: {
      success: false,
      message: 'database rejected an optional price',
    },
  })

  await expect(
    createPurchaseDraft(
      {} as Parameters<typeof createPurchaseDraft>[0]
    )
  ).rejects.toThrow('database rejected an optional price')
})
