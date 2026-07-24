// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RechargeCheckoutV2 } from '../components/recharge-checkout-v2'
import type { TopupInfo } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const topupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: true,
  enable_redemption: true,
  min_topup: 10,
  stripe_min_topup: 10,
  amount_options: [10, 500],
  discount: { 500: 0.95 },
  pay_methods: [{ name: 'Stripe', type: 'stripe', min_topup: 10 }],
} as TopupInfo

describe('RechargeCheckoutV2', () => {
  afterEach(cleanup)

  test('selects amount and payment method before enabling checkout', () => {
    const onSelectPreset = vi.fn()
    const onSelectPaymentMethod = vi.fn()

    const { rerender } = render(
      <RechargeCheckoutV2
        topupInfo={topupInfo}
        presetAmounts={[
          { value: 10, discount: 1 },
          { value: 500, discount: 0.95 },
        ]}
        selectedPreset={null}
        topupAmount={10}
        paymentAmount={10}
        paymentLoading={null}
        calculating={false}
        loading={false}
        priceRatio={1}
        usdExchangeRate={1}
        onSelectPreset={onSelectPreset}
        onTopupAmountChange={vi.fn()}
        onSelectPaymentMethod={onSelectPaymentMethod}
        onCheckout={vi.fn()}
        onOpenBilling={vi.fn()}
      />
    )

    const checkout = screen.getByRole('button', { name: /Pay Now/ })
    expect(checkout).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /500/ }))
    expect(onSelectPreset).toHaveBeenCalledWith({
      value: 500,
      discount: 0.95,
    })

    fireEvent.click(screen.getByRole('button', { name: /Stripe/ }))
    expect(onSelectPaymentMethod).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stripe' })
    )

    rerender(
      <RechargeCheckoutV2
        topupInfo={topupInfo}
        presetAmounts={[
          { value: 10, discount: 1 },
          { value: 500, discount: 0.95 },
        ]}
        selectedPreset={500}
        topupAmount={500}
        paymentAmount={475}
        selectedPaymentMethod={{
          name: 'Stripe',
          type: 'stripe',
          min_topup: 10,
        }}
        paymentLoading={null}
        calculating={false}
        loading={false}
        priceRatio={1}
        usdExchangeRate={1}
        onSelectPreset={onSelectPreset}
        onTopupAmountChange={vi.fn()}
        onSelectPaymentMethod={onSelectPaymentMethod}
        onCheckout={vi.fn()}
        onOpenBilling={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Pay Now/ })).toBeEnabled()
    expect(screen.getByText('−$25')).toBeVisible()
  })
})
