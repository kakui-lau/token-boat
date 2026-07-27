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
import { useEffect, useState } from 'react'

import { getUserBillingHistory } from '../api'
import type { TopupStatus } from '../types'

export type PaymentReturnState =
  | 'idle'
  | 'checking'
  | 'success'
  | 'failed'
  | 'expired'
  | 'timeout'

type BillingHistoryFetcher = typeof getUserBillingHistory
type Wait = (delayMs: number) => Promise<void>

const POLL_ATTEMPTS = 10
const POLL_INTERVAL_MS = 1500

const wait: Wait = (delayMs) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, delayMs)
  })

export async function pollTopupStatus(
  tradeNo: string,
  fetchBillingHistory: BillingHistoryFetcher = getUserBillingHistory,
  waitForNextAttempt: Wait = wait
): Promise<Exclude<PaymentReturnState, 'idle' | 'checking'>> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchBillingHistory(1, 10, tradeNo)
      const order = response.data?.items.find(
        (item) => item.trade_no === tradeNo
      )
      const status = order?.status as TopupStatus | undefined

      if (status && status !== 'pending') {
        return status
      }
    } catch {
      // A transient request error should not stop payment confirmation.
    }

    if (attempt < POLL_ATTEMPTS - 1) {
      await waitForNextAttempt(POLL_INTERVAL_MS)
    }
  }

  return 'timeout'
}

export function usePaymentReturnConfirmation(
  tradeNo: string | undefined,
  enabled: boolean,
  onSuccess: () => Promise<void>
): PaymentReturnState {
  const [state, setState] = useState<PaymentReturnState>(
    enabled && tradeNo ? 'checking' : 'idle'
  )

  useEffect(() => {
    if (!enabled || !tradeNo) {
      setState('idle')
      return
    }

    let cancelled = false
    setState('checking')

    void pollTopupStatus(tradeNo).then(async (result) => {
      if (cancelled) return

      if (result === 'success') {
        await onSuccess()
        if (cancelled) return
      }

      setState(result)
      window.history.replaceState({}, '', window.location.pathname)
    })

    return () => {
      cancelled = true
    }
  }, [enabled, onSuccess, tradeNo])

  return state
}
