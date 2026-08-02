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
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  exportChannelModelPrices,
  getChannelModels,
  setPricingModelRuntime,
} from '../api'
import { PricingAdmin } from '../index'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/'>{children}</a>
  ),
}))

vi.mock('../api', () => ({
  exportChannelModelPrices: vi.fn(),
  getChannelModels: vi.fn(),
  getPricingCatalogOptions: vi.fn().mockResolvedValue({
    data: {
      channels: [{ id: 1, name: 'Published Channel' }],
      models: [],
    },
  }),
  getPricingCircuitOverview: vi.fn().mockResolvedValue({
    success: true,
    data: { channels: [], events: [] },
  }),
  getPricingCircuitEvents: vi.fn().mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 100 },
  }),
  getPricingFinancialSummary: vi.fn().mockResolvedValue({
    success: true,
    data: {
      settled_count: 0,
      revenue_usd: '0',
      estimated_purchase_usd: '0',
      provider_reported_cost_usd: '0',
      cost_variance_usd: '0',
      gross_margin_usd: '0',
      provider_cost_known_count: 0,
      provider_cost_missing_count: 0,
      full_provider_cost_count: 0,
    },
  }),
  getPricingReconciliationSummary: vi.fn().mockResolvedValue({
    success: true,
    data: {
      pending: 0,
      stale_reserved: 0,
      settled_last_24h: 0,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 0,
    },
  }),
  getRequestPricingSnapshots: vi.fn().mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 20 },
  }),
  resetPricingCircuit: vi.fn(),
  getPricingRuntimeStatus: vi.fn().mockResolvedValue({
    success: true,
    data: {
      total_channel_models: 2,
      v2_channel_models: 0,
      complete_group_model_scopes: 0,
      live_traffic_enabled: false,
    },
  }),
  setPricingModelRuntime: vi.fn(),
  syncLegacyChannelModels: vi.fn(),
}))

function renderPricingAdmin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PricingAdmin />
    </QueryClientProvider>
  )
}

describe('channel model retail publication status', () => {
  beforeEach(() => {
    vi.mocked(exportChannelModelPrices).mockResolvedValue(
      new Blob(['channel pricing'])
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:channel-pricing')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.mocked(getChannelModels).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 11,
            channel_id: 1,
            channel_name: 'Published Channel',
            model_id: 101,
            model_name: 'published-model',
            currency: 'USD',
            upstream_model_name: 'published-provider-model',
            status: 1,
            priority: 0,
            weight: 0,
            region: '',
            runtime_mode: 'legacy',
            active_retail_price_version_id: 301,
            active_retail_price_version: 3,
          },
          {
            id: 12,
            channel_id: 1,
            channel_name: 'Unpublished Channel',
            model_id: 102,
            model_name: 'unpublished-model',
            currency: 'USD',
            upstream_model_name: 'unpublished-provider-model',
            status: 1,
            priority: 0,
            weight: 0,
            region: '',
            runtime_mode: 'legacy',
            active_retail_price_version_id: 0,
            active_retail_price_version: 0,
          },
        ],
        total: 2,
        page: 1,
        page_size: 50,
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  test('shows the active retail version and supports publication filtering', async () => {
    renderPricingAdmin()

    const publishedRow = (await screen.findByText('published-model')).closest(
      'tr'
    )
    expect(screen.queryByText('Billing Anomalies')).not.toBeInTheDocument()
    const unpublishedRow = screen.getByText('unpublished-model').closest('tr')
    if (!publishedRow || !unpublishedRow) {
      throw new Error('expected both channel model rows')
    }
    expect(within(publishedRow).getByText('Published')).toBeVisible()
    expect(within(publishedRow).getByText('v3')).toBeVisible()
    expect(within(unpublishedRow).getByText('Not Published')).toBeVisible()

    fireEvent.change(screen.getByLabelText('Retail Status'), {
      target: { value: 'published' },
    })

    await waitFor(() => {
      expect(getChannelModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ retail_status: 'published' })
      )
    })
  })

  test('enables V2 for every channel of the selected model', async () => {
    vi.mocked(setPricingModelRuntime).mockResolvedValue({
      success: true,
      data: {
        model_name: 'published-model',
        runtime_mode: 'v2',
        updated: 2,
      },
    })
    renderPricingAdmin()

    const publishedRow = (await screen.findByText('published-model')).closest(
      'tr'
    )
    if (!publishedRow) {
      throw new Error('expected the published channel model row')
    }
    fireEvent.click(
      within(publishedRow).getByRole('button', { name: 'Enable Model V2' })
    )
    expect(setPricingModelRuntime).not.toHaveBeenCalled()
    const confirmDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: 'Enable Model V2' })
    )

    await waitFor(() =>
      expect(setPricingModelRuntime).toHaveBeenCalledWith({
        model_name: 'published-model',
        runtime_mode: 'v2',
      })
    )
  })

  test('exports the currently filtered channel pricing rows', async () => {
    renderPricingAdmin()

    expect(
      screen.queryByRole('button', { name: 'Price Comparison' })
    ).not.toBeInTheDocument()
    const exportButton = await screen.findByRole('button', {
      name: 'Export filtered CSV',
    })

    await screen.findByRole('option', { name: 'Published Channel' })
    fireEvent.change(screen.getByLabelText('Channel'), {
      target: { value: '1' },
    })
    await waitFor(() =>
      expect(getChannelModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ channel_id: 1 })
      )
    )
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Runtime'), {
      target: { value: 'v2' },
    })
    fireEvent.change(screen.getByLabelText('Retail Status'), {
      target: { value: 'published' },
    })

    fireEvent.click(exportButton)

    await waitFor(() =>
      expect(exportChannelModelPrices).toHaveBeenCalledWith({
        keyword: undefined,
        channel_id: 1,
        status: 1,
        runtime_mode: 'v2',
        retail_status: 'published',
      })
    )
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:channel-pricing')
  })
})
