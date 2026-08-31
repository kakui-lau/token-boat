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
