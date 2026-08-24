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

import type { PublicPriceSummary } from '../../types'
import {
  PublicPriceComparison,
  PublicPriceSummaryCompact,
} from '../public-price-summary'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)

describe('public price summary', () => {
  test('shows official and lowest token prices per selected token unit', () => {
    const official: PublicPriceSummary = {
      currency: 'USD',
      billing_mode: 'token',
      price_structure: 'flat',
      items: [
        {
          key: 'input',
          component: 'token_input',
          amount: '2.5',
          unit: 'token',
          unit_size: '1000000',
        },
        {
          key: 'output',
          component: 'token_output',
          amount: '15',
          unit: 'token',
          unit_size: '1000000',
        },
      ],
    }

    render(
      <PublicPriceComparison
        official={official}
        lowest={{
          ...official,
          items: official.items.map((item) => ({
            ...item,
            amount: item.component === 'token_input' ? '1.25' : '7.5',
            applied_group: 'default',
            applied_group_label: 'Default',
          })),
        }}
        tokenUnit='M'
      />
    )

    expect(screen.queryByText('Official Price')).not.toBeInTheDocument()
    expect(screen.getByText('Lowest item price')).toBeVisible()
    expect(screen.getByText('$2.5').closest('del')).toBeVisible()
    expect(screen.getByText('$15').closest('del')).toBeVisible()
    expect(screen.getByText('$1.25')).toHaveClass('text-primary')
    expect(screen.getByText('$7.5')).toHaveClass('text-primary')
    expect(screen.getByText('Effective group')).toBeVisible()
    expect(screen.getByText('Default')).toBeVisible()
    expect(screen.getAllByText(/1M tokens/)).toHaveLength(2)
  })

  test('shows video resolution and per-second price without token units', () => {
    render(
      <PublicPriceSummaryCompact
        tokenUnit='M'
        summary={{
          currency: 'USD',
          billing_mode: 'video_duration',
          price_structure: 'expression',
          items: [
            {
              key: '480p',
              component: 'video_output',
              amount: '0.0544',
              unit: 'second',
              unit_size: '1',
              tier: '480p',
              resolution: '480p',
            },
          ],
        }}
      />
    )

    expect(screen.getByText('480p')).toBeVisible()
    expect(screen.getByText('$0.0544')).toBeVisible()
    expect(screen.getByText(/second/)).toBeVisible()
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument()
  })

  test('applies recharge rate only to the customer sales price comparison', () => {
    const summary: PublicPriceSummary = {
      currency: 'USD',
      billing_mode: 'request',
      price_structure: 'flat',
      items: [
        {
          key: 'request',
          component: 'request',
          amount: '2',
          unit: 'request',
          unit_size: '1',
        },
      ],
    }

    render(
      <PublicPriceComparison
        official={summary}
        lowest={{
          ...summary,
          items: [{ ...summary.items[0], amount: '1' }],
        }}
        tokenUnit='M'
        showRechargePrice
        priceRate={0.5}
        usdExchangeRate={1}
      />
    )

    expect(screen.getByText('$2')).toBeVisible()
    expect(screen.getByText('$0.5')).toBeVisible()
  })

  test('distinguishes dynamic quote pricing from missing configuration', () => {
    render(
      <PublicPriceComparison tokenUnit='M' lowestEmptyLabel='Quote required' />
    )

    expect(screen.getByText('Quote required')).toBeVisible()
    expect(screen.getByText('Not configured')).toBeVisible()
  })
})
