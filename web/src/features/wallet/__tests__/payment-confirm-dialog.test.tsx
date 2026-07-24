// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PaymentConfirmDialog } from '../components/dialogs/payment-confirm-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

describe('PaymentConfirmDialog', () => {
  afterEach(cleanup)

  test('shows currency units and a clear discounted payment summary', () => {
    render(
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        topupAmount={50}
        paymentAmount={49}
        paymentMethod={{ name: 'Stripe', type: 'stripe' }}
        calculating={false}
        processing={false}
        discountRate={0.98}
      />
    )

    expect(screen.getAllByText('$50')).toHaveLength(2)
    expect(screen.getByText('$49')).toBeVisible()
    expect(screen.getByText('$1')).toBeVisible()
    expect(screen.getByText('Stripe')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Confirm Payment' })
    ).toBeEnabled()
  })
})
