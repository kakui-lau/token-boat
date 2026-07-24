// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RedemptionCodeCard } from '../components/redemption-code-card'
import { WalletStatsCard } from '../components/wallet-stats-card'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))

describe('Wallet overview', () => {
  afterEach(cleanup)

  test('places a prominent recharge link with the current balance', () => {
    render(
      <WalletStatsCard
        user={{
          id: 1,
          username: 'wallet-user',
          quota: 100,
          used_quota: 20,
          request_count: 3,
          aff_quota: 0,
          aff_history_quota: 0,
          aff_count: 0,
          group: 'default',
        }}
        showRechargeAction
      />
    )

    expect(screen.getByRole('link', { name: 'Recharge' })).toHaveAttribute(
      'href',
      '/recharge'
    )
  })

  test('keeps redemption available as a focused wallet action', () => {
    const onCodeChange = vi.fn()
    const onRedeem = vi.fn()

    render(
      <RedemptionCodeCard
        code='CODE-123'
        enabled
        redeeming={false}
        onCodeChange={onCodeChange}
        onRedeem={onRedeem}
      />
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Redemption Code' }), {
      target: { value: 'CODE-456' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(onCodeChange).toHaveBeenCalledWith('CODE-456')
    expect(onRedeem).toHaveBeenCalledOnce()
  })
})
