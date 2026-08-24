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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { SalesDiscountCalculator } from '..'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { discount?: string }) => {
      if (key === 'Discount tenths unit') return '折'
      return values?.discount ? `${key} ${values.discount}` : key
    },
  }),
}))

describe('sales discount calculator', () => {
  afterEach(cleanup)

  test('calculates VCR and sales discount from the default rates', () => {
    render(<SalesDiscountCalculator />)

    expect(screen.getByLabelText('Variable cost rate (%)')).toHaveValue('11.00')
    expect(screen.getByLabelText('Sales discount')).toHaveTextContent(
      '8.19398 折'
    )
    expect(screen.getByLabelText('Sales discount')).not.toHaveTextContent('%')
    expect(screen.getByText('Below official price')).toBeVisible()
  })

  test('updates the result from edited percentage inputs', () => {
    render(<SalesDiscountCalculator />)

    fireEvent.change(screen.getByLabelText('Purchase discount (%)'), {
      target: { value: '80' },
    })
    fireEvent.change(screen.getByLabelText('Payment fee (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Distribution fee (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Operations labor cost (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Profit tax rate (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Target net margin (%)'), {
      target: { value: '20' },
    })

    expect(screen.getByLabelText('Variable cost rate (%)')).toHaveValue('0.00')
    expect(screen.getByLabelText('Sales discount')).toHaveTextContent(
      '10.00000'
    )
    expect(screen.getByText('At or above official price')).toBeVisible()
  })

  test('explains when the formula denominator is not positive', () => {
    render(<SalesDiscountCalculator />)

    fireEvent.change(screen.getByLabelText('Payment fee (%)'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('Distribution fee (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Operations labor cost (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Profit tax rate (%)'), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText('Target net margin (%)'), {
      target: { value: '0' },
    })

    expect(screen.getByLabelText('Sales discount')).toHaveTextContent('—')
    expect(screen.getByText('Calculation unavailable')).toBeVisible()
  })
})
