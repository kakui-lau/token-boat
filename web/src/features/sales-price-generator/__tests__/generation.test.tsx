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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getPricingCatalogOptions } from '@/features/pricing-admin/api'
import { storedRateToPercentage } from '@/features/pricing-admin/lib/rate-format'

import {
  exportGeneratedSalesPrices,
  generateSalesPrices,
  getSupportedChannelModels,
} from '../api'
import { SalesPriceGenerator } from '../index'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      let translated = key
      for (const [name, value] of Object.entries(values ?? {})) {
        translated = translated.replaceAll(`{{${name}}}`, String(value))
      }
      return translated
    },
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: 100 } } }),
}))

vi.mock('../api', () => ({
  exportGeneratedSalesPrices: vi.fn(),
  generateSalesPrices: vi.fn(),
  getSupportedChannelModels: vi.fn(),
}))

vi.mock('@/features/pricing-admin/api', () => ({
  getPricingCatalogOptions: vi.fn(),
}))

function renderGenerator() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <SalesPriceGenerator />
    </QueryClientProvider>
  )
}

describe('sales price generation', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generated-prices')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.mocked(getPricingCatalogOptions).mockResolvedValue({
      success: true,
      data: {
        channels: [{ id: 7, name: 'channel-a' }],
        models: [],
      },
    })
    vi.mocked(getSupportedChannelModels).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            channel_model_id: 11,
            model_id: 21,
            model_name: 'supported-model',
            channel_name: 'channel-a',
            upstream_model_name: 'upstream-model',
            runtime_mode: 'v2',
            purchase_pricing_mode: 'Official price uniform discount',
            purchase_discount: '6折（官方价的60%）',
          },
          {
            channel_model_id: 12,
            model_id: 22,
            model_name: 'second-model',
            channel_name: 'channel-b',
            upstream_model_name: 'second-upstream-model',
            runtime_mode: 'v2',
            purchase_pricing_mode: 'Official price uniform discount',
            purchase_discount: '5折（官方价的50%）',
          },
        ],
        total: 2,
        page: 1,
        page_size: 200,
      },
    })
    vi.mocked(generateSalesPrices).mockImplementation(async (input) => ({
      success: true,
      data: {
        rates: input,
        maximum_channel_count: 2,
        items: [
          {
            model_id: 21,
            model_name: 'supported-model',
            effective_rate_details: `VCR ${storedRateToPercentage(
              input.total_variable_cost_rate
            )}%；TR ${storedRateToPercentage(
              input.effective_tax_rate
            )}%；TM ${storedRateToPercentage(input.target_net_margin)}%`,
            minimum_retail_discount: '7.023折（70.23%）',
            minimum_purchase_discount: '5折（50%）',
            channels: [
              {
                channel_model_id: 11,
                channel_name: 'channel-a',
                purchase_discount: '6折（60%）',
                retail_discount: '7.023折（70.23%）',
              },
              {
                channel_model_id: 12,
                channel_name: 'channel-b',
                purchase_discount: '5折（50%）',
                retail_discount: '5.853折（58.53%）',
              },
            ],
          },
        ],
      },
    }))
    vi.mocked(exportGeneratedSalesPrices).mockResolvedValue(
      new Blob(['generated prices'])
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  test('uses the requested defaults and generates dynamic channel columns', async () => {
    renderGenerator()

    expect(await screen.findByText('supported-model')).toBeInTheDocument()
    expect(screen.getByTestId('sales-price-generator-scroll')).toHaveClass(
      'overflow-y-auto'
    )
    expect(
      screen.getByTestId('supported-channel-model-scroll')
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Payment processing fee')).toHaveValue(4)
    expect(screen.getByLabelText('Distribution fee')).toHaveValue(5)
    expect(screen.getByLabelText('Operations labor cost')).toHaveValue(2)
    expect(screen.getByLabelText('Variable Cost Rate (VCR)')).toHaveValue(11)
    expect(screen.getByLabelText('Variable Cost Rate (VCR)')).toHaveAttribute(
      'readonly'
    )
    expect(screen.getByLabelText('Tax Rate (TR)')).toHaveValue(16)
    expect(screen.getByLabelText('Target Margin (TM)')).toHaveValue(3)
    expect(
      screen.getByRole('button', { name: 'Export generated table' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Generate sales prices' })
    ).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )

    await waitFor(() => {
      expect(vi.mocked(generateSalesPrices).mock.calls[0]?.[0]).toEqual({
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11, 12],
      })
    })
    expect(
      await screen.findByRole('columnheader', {
        name: 'Minimum sales discount',
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Minimum purchase discount' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Channel A name' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Channel B sales discount' })
    ).toBeInTheDocument()
    expect(screen.getByTestId('generated-price-scroll')).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'VCR' })
    ).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'TR' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'TM' })).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Export generated table' })
    )
    await waitFor(() => {
      expect(vi.mocked(exportGeneratedSalesPrices).mock.calls[0]?.[0]).toEqual({
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11, 12],
        model_rates: [
          {
            model_id: 21,
            total_variable_cost_rate: '0.11',
            effective_tax_rate: '0.16',
            target_net_margin: '0.03',
          },
        ],
      })
    })
  })

  test('recalculates the variable cost rate from its three components', async () => {
    renderGenerator()

    expect(await screen.findByText('supported-model')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Payment processing fee'), {
      target: { value: '4.5' },
    })
    fireEvent.change(screen.getByLabelText('Distribution fee'), {
      target: { value: '5.25' },
    })
    fireEvent.change(screen.getByLabelText('Operations labor cost'), {
      target: { value: '2.25' },
    })

    expect(screen.getByLabelText('Variable Cost Rate (VCR)')).toHaveValue(12)

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select supported-model' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )
    await waitFor(() => {
      expect(vi.mocked(generateSalesPrices).mock.calls.at(-1)?.[0]).toEqual({
        total_variable_cost_rate: '0.12',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11],
      })
    })
  })

  test('rejects a combined variable cost rate of 100 percent', async () => {
    renderGenerator()

    expect(await screen.findByText('supported-model')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Payment processing fee'), {
      target: { value: '40' },
    })
    fireEvent.change(screen.getByLabelText('Distribution fee'), {
      target: { value: '40' },
    })
    fireEvent.change(screen.getByLabelText('Operations labor cost'), {
      target: { value: '20' },
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select supported-model' })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )

    expect(
      await screen.findByText(
        'The combined variable cost rate must be less than 100%.'
      )
    ).toBeInTheDocument()
    expect(generateSalesPrices).not.toHaveBeenCalled()
  })

  test('applies channel pricing filters to the list, generation, and export', async () => {
    renderGenerator()

    expect(await screen.findByText('supported-model')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search channels or models'), {
      target: { value: 'gemini' },
    })
    fireEvent.change(screen.getByLabelText('Channel'), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText('Routing'), {
      target: { value: 'available' },
    })
    fireEvent.change(screen.getByLabelText('Runtime'), {
      target: { value: 'v2' },
    })

    await waitFor(() => {
      expect(vi.mocked(getSupportedChannelModels)).toHaveBeenLastCalledWith({
        keyword: 'gemini',
        channel_id: 7,
        routing_status: 'available',
        runtime_mode: 'v2',
        page: 1,
        page_size: 200,
      })
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Select current page' })
      ).toBeEnabled()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )
    await waitFor(() => {
      expect(vi.mocked(generateSalesPrices)).toHaveBeenLastCalledWith(
        {
          total_variable_cost_rate: '0.11',
          effective_tax_rate: '0.16',
          target_net_margin: '0.03',
          channel_model_ids: [11, 12],
        },
        {
          keyword: 'gemini',
          channel_id: 7,
          routing_status: 'available',
          runtime_mode: 'v2',
        }
      )
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Export generated table' })
    )
    await waitFor(() => {
      expect(vi.mocked(exportGeneratedSalesPrices)).toHaveBeenLastCalledWith(
        {
          total_variable_cost_rate: '0.11',
          effective_tax_rate: '0.16',
          target_net_margin: '0.03',
          channel_model_ids: [11, 12],
          model_rates: [
            {
              model_id: 21,
              total_variable_cost_rate: '0.11',
              effective_tax_rate: '0.16',
              target_net_margin: '0.03',
            },
          ],
        },
        {
          keyword: 'gemini',
          channel_id: 7,
          routing_status: 'available',
          runtime_mode: 'v2',
        }
      )
    })
  })

  test('selects, inverts, clears, and generates only selected channel models', async () => {
    renderGenerator()

    expect(await screen.findByText('second-model')).toBeInTheDocument()
    const firstRow = screen.getByRole('checkbox', {
      name: 'Select supported-model',
    })
    const secondRow = screen.getByRole('checkbox', {
      name: 'Select second-model',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))
    expect(firstRow).toBeChecked()
    expect(secondRow).toBeChecked()
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Invert current page' }))
    expect(firstRow).not.toBeChecked()
    expect(secondRow).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(firstRow).not.toBeChecked()
    expect(secondRow).not.toBeChecked()
    expect(
      screen.getByRole('button', { name: 'Generate sales prices' })
    ).toBeDisabled()

    fireEvent.click(firstRow)
    expect(
      screen.getByRole('button', { name: 'Generate sales prices' })
    ).toBeEnabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )
    await waitFor(() => {
      expect(vi.mocked(generateSalesPrices).mock.calls.at(-1)?.[0]).toEqual({
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11],
      })
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Export generated table' })
    )
    await waitFor(() => {
      expect(
        vi.mocked(exportGeneratedSalesPrices).mock.calls.at(-1)?.[0]
      ).toEqual({
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11],
        model_rates: [
          {
            model_id: 21,
            total_variable_cost_rate: '0.11',
            effective_tax_rate: '0.16',
            target_net_margin: '0.03',
          },
        ],
      })
    })
  })

  test('regenerates a single row when an editable rate is changed', async () => {
    renderGenerator()

    expect(await screen.findByText('supported-model')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate sales prices' })
    )

    // Wait for the generated table to appear
    await screen.findByRole('columnheader', { name: 'Minimum sales discount' })

    // The table should have an editable VCR input
    const vcrInput = screen.getByLabelText('VCR')
    expect(vcrInput).toBeInTheDocument()

    // Change the VCR value from 11 to 15
    fireEvent.change(vcrInput, { target: { value: '15' } })

    // Wait for the debounced (500 ms) row regeneration
    await waitFor(
      () => {
        expect(vi.mocked(generateSalesPrices).mock.calls.at(-1)?.[0]).toEqual({
          total_variable_cost_rate: '0.15',
          effective_tax_rate: '0.16',
          target_net_margin: '0.03',
          channel_model_ids: [11, 12],
        })
      },
      { timeout: 3000 }
    )

    // Wait for the regenerated row to be merged into the table, then verify
    // that exporting uses the edited rate instead of the original one.
    await waitFor(
      () => {
        expect(screen.getByLabelText('VCR')).toHaveValue(15)
      },
      { timeout: 3000 }
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Export generated table' })
    )
    await waitFor(() => {
      expect(
        vi.mocked(exportGeneratedSalesPrices).mock.calls.at(-1)?.[0]
      ).toEqual({
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        channel_model_ids: [11, 12],
        model_rates: [
          {
            model_id: 21,
            total_variable_cost_rate: '0.15',
            effective_tax_rate: '0.16',
            target_net_margin: '0.03',
          },
        ],
      })
    })
  })
})
