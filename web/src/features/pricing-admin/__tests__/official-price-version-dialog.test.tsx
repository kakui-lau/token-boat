// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { OfficialPriceVersionDialog } from '../components/official-price-version-dialog'
import type { OfficialPriceVersion } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(cleanup)

describe('Official price version details', () => {
  test('renders tiered token prices as readable tiers without object placeholders or empty prices', () => {
    const version: OfficialPriceVersion = {
      id: 1,
      model_id: 2,
      billing_mode: 'token',
      price_structure: 'tiered',
      price_components: JSON.stringify({
        cache_read_unit_price: '0.25',
        cache_write_unit_price: '',
        image_input_unit_price: '',
        image_output_unit_price: '',
        input_unit_price: '2.5',
        output_unit_price: '15',
        price_unit: 'per_1m_tokens',
        tiers: [
          {
            cache_read_unit_price: '0.25',
            input_unit_price: '2.5',
            name: 'standard',
            output_unit_price: '15',
            upper_bound: '272000',
          },
          {
            cache_read_unit_price: '0.5',
            input_unit_price: '5',
            name: 'long_context',
            output_unit_price: '22.5',
            upper_bound: '1050000',
          },
        ],
      }),
      billing_expr:
        'v1:len <= 272000 ? tier("standard", p * 2.5 + c * 15 + cr * 0.25) : tier("long_context", p * 5 + c * 22.5 + cr * 0.5)',
      currency: 'USD',
      version: 1,
      status: 'active',
      source: 'vendor-official',
      remark: '',
      effective_from: 1,
      effective_to: 0,
    }

    render(
      <OfficialPriceVersionDialog version={version} onOpenChange={vi.fn()} />
    )

    expect(screen.getByText('Standard')).toBeVisible()
    expect(screen.getByText('Long context')).toBeVisible()
    expect(screen.getByText('Context ≤ 272,000 tokens')).toBeVisible()
    expect(
      screen.getByText('272,000 < Context ≤ 1,050,000 tokens')
    ).toBeVisible()
    expect(screen.getAllByText('2.5 USD')).toHaveLength(1)
    expect(screen.getByText('22.5 USD')).toBeVisible()
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Cache Write / 1M tokens')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Image Input / 1M tokens')
    ).not.toBeInTheDocument()
  })
})
