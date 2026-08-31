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
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  acknowledgeFinanceAlert,
  getFinanceAlerts,
  getFinanceTrend,
  getFinanceUserDetail,
  getFinanceUsers,
  getPaymentCallbackEvents,
  resolveFinanceAlert,
  scanFinanceAlerts,
} from '../api'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockedGet = vi.mocked(api.get)
const mockedPost = vi.mocked(api.post)

describe('finance API contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedGet.mockResolvedValue({ data: { success: true, data: {} } })
    mockedPost.mockResolvedValue({ data: { success: true, data: {} } })
  })

  test('requests daily trends with the selected reporting window', async () => {
    await getFinanceTrend('7d')

    expect(mockedGet).toHaveBeenCalledOnce()
    const [, config] = mockedGet.mock.calls[0]
    const params = config?.params as { start_time: number; end_time: number }
    expect(mockedGet.mock.calls[0][0]).toBe('/api/user/topup/trend')
    expect(params.end_time - params.start_time).toBe(7 * 24 * 60 * 60)
  })

  test('passes callback filters and pagination to the audit endpoint', async () => {
    await getPaymentCallbackEvents(
      {
        period: '30d',
        provider: 'stripe',
        status: 'failed',
        keyword: 'order-42',
      },
      3,
      20
    )

    expect(mockedGet).toHaveBeenCalledWith(
      '/api/user/finance/callback-events',
      expect.objectContaining({
        params: expect.objectContaining({
          provider: 'stripe',
          status: 'failed',
          keyword: 'order-42',
          p: 3,
          page_size: 20,
        }),
      })
    )
  })

  test('uses dedicated list and detail endpoints for user funds', async () => {
    await getFinanceUsers('alice', 2, 20)
    await getFinanceUserDetail(42)

    expect(mockedGet).toHaveBeenNthCalledWith(1, '/api/user/finance/users', {
      params: { keyword: 'alice', p: 2, page_size: 20 },
    })
    expect(mockedGet).toHaveBeenNthCalledWith(2, '/api/user/finance/users/42')
  })

  test('uses audited alert scan and lifecycle endpoints', async () => {
    await getFinanceAlerts({ status: 'open', severity: 'critical' }, 1, 20)
    await scanFinanceAlerts()
    await acknowledgeFinanceAlert(8)
    await resolveFinanceAlert(8, 'Balance corrected')

    expect(mockedGet).toHaveBeenCalledWith('/api/user/finance/alerts', {
      params: {
        status: 'open',
        severity: 'critical',
        p: 1,
        page_size: 20,
      },
    })
    expect(mockedPost).toHaveBeenNthCalledWith(
      1,
      '/api/user/finance/alerts/scan'
    )
    expect(mockedPost).toHaveBeenNthCalledWith(
      2,
      '/api/user/finance/alerts/8/acknowledge',
      {}
    )
    expect(mockedPost).toHaveBeenNthCalledWith(
      3,
      '/api/user/finance/alerts/8/resolve',
      { note: 'Balance corrected' }
    )
  })
})
