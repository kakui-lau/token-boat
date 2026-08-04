// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { FinanceOverviewPanel } from '../components/finance-overview'
import type { FinanceOverview } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        key
      ),
  }),
}))

afterEach(cleanup)

const overview: FinanceOverview = {
  generated_at: 0,
  period_start: 0,
  period_end: 0,
  balance: {
    wallet_quota: 0,
    affiliate_quota: 0,
    subscription_quota: 0,
    total_available_quota: 0,
    negative_wallet_quota: 0,
    user_count: 0,
    users_with_balance: 0,
    unlimited_subscription_count: 0,
  },
  orders: {
    total_count: 0,
    success_count: 0,
    pending_count: 0,
    failed_count: 0,
    expired_count: 0,
    success_amount: 0,
    pending_amount: 0,
    external_success_count: 0,
    wallet_success_count: 0,
    wallet_success_amount: 0,
    subscription_success_count: 0,
    subscription_success_amount: 0,
    internal_subscription_count: 0,
    internal_subscription_amount: 0,
  },
  statuses: [],
  providers: [],
  redemptions: {
    available_count: 15,
    available_quota: 550_000_000,
    redeemed_count: 6,
    redeemed_quota: 250_000_000,
    expired_count: 0,
    expired_quota: 0,
  },
}

describe('redemption summary layout', () => {
  test('labels code count and total value as separate columns', () => {
    render(<FinanceOverviewPanel data={overview} loading={false} />)

    const summary = screen.getByTestId('redemption-summary')
    expect(within(summary).getByText('Redemption code summary')).toBeVisible()
    expect(within(summary).getByText('Code count')).toBeVisible()
    expect(within(summary).getByText('Total value')).toBeVisible()

    const available = within(summary).getByTestId(
      'redemption-summary-available'
    )
    expect(within(available).getByText('15')).toBeVisible()
    expect(within(available).getByText('$1,100')).toBeVisible()
    expect(available).not.toHaveTextContent('15 · $1,100')
  })
})
