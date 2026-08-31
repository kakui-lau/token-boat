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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { BillingHistoryResponse } from '../../types'
import { pollTopupStatus } from '../use-payment-return'

function response(
  tradeNo: string,
  status: 'pending' | 'success' | 'failed' | 'expired'
) {
  return {
    success: true,
    data: {
      items: [
        {
          id: 1,
          user_id: 1,
          amount: 10,
          money: 1,
          trade_no: tradeNo,
          payment_method: 'stripe',
          create_time: 1,
          status,
        },
      ],
      total: 1,
    } satisfies BillingHistoryResponse,
  }
}

describe('Stripe payment return confirmation', () => {
  test('waits through pending status and returns success', async () => {
    let calls = 0

    const result = await pollTopupStatus(
      'ref_payment',
      async () => {
        calls += 1
        return response('ref_payment', calls === 1 ? 'pending' : 'success')
      },
      async () => {}
    )

    assert.equal(result, 'success')
    assert.equal(calls, 2)
  })

  test('ignores a different order returned by fuzzy search', async () => {
    const result = await pollTopupStatus(
      'ref_payment',
      async () => response('ref_payment_old', 'success'),
      async () => {}
    )

    assert.equal(result, 'timeout')
  })

  test('returns a terminal failure without retrying', async () => {
    let calls = 0

    const result = await pollTopupStatus(
      'ref_payment',
      async () => {
        calls += 1
        return response('ref_payment', 'failed')
      },
      async () => {}
    )

    assert.equal(result, 'failed')
    assert.equal(calls, 1)
  })
})
