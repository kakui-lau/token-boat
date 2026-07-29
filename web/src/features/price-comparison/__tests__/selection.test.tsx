// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { getModelPriceOverview } from '@/features/pricing-admin/api'

import { PriceComparison } from '..'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/features/pricing-admin/api', () => ({
  getModelPriceOverview: vi.fn().mockResolvedValue({
    data: [
      {
        model_id: 1,
        model_name: 'gpt-test',
        currency: 'USD',
        active_channel_count: 2,
        endpoints: [
          {
            channel_model_id: 11,
            channel_name: 'Channel A',
            upstream_model_name: 'provider-a',
            runtime_mode: 'v2',
            billing_mode: 'token',
            price_structure: 'flat',
            purchase_input_unit_price: '1',
            purchase_output_unit_price: '2',
            retail_input_unit_price: '2',
            retail_output_unit_price: '4',
            retail_cache_read_unit_price: '',
            retail_cache_write_unit_price: '',
            target_net_margin: '0.2',
          },
          {
            channel_model_id: 12,
            channel_name: 'Channel B',
            upstream_model_name: 'provider-b',
            runtime_mode: 'legacy',
            billing_mode: 'token',
            price_structure: 'flat',
            purchase_input_unit_price: '1.5',
            purchase_output_unit_price: '3',
            retail_input_unit_price: '2.5',
            retail_output_unit_price: '5',
            retail_cache_read_unit_price: '',
            retail_cache_write_unit_price: '',
            target_net_margin: '0.25',
          },
        ],
      },
    ],
  }),
}))

describe('Price comparison channel selection', () => {
  afterEach(cleanup)

  test('shows only the channels selected for the chosen model', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <PriceComparison />
      </QueryClientProvider>
    )

    expect(getModelPriceOverview).toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Channel A' }))

    expect(screen.getByRole('cell', { name: 'Channel A' })).toBeVisible()
    expect(
      screen.queryByRole('cell', { name: 'Channel B' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Channel B' }))
    expect(screen.getByRole('cell', { name: 'Channel B' })).toBeVisible()
  })
})
