import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { getActivePriceBundle } from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}))

beforeEach(() => {
  vi.mocked(api.get).mockReset()
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
      skipErrorHandler: true,
    }
  )
})
