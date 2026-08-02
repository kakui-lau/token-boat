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
import { afterEach, expect, test, vi } from 'vitest'

import { PricingReconciliationPage } from '../../pricing-reconciliation'
import {
  confirmPricingSnapshotRefunded,
  getPricingReconciliationSummary,
  getRequestPricingSnapshots,
} from '../api'
import { PricingReconciliationPanel } from '../components/pricing-reconciliation-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { page?: number; total?: number }) => {
      let translated = key
      if (values?.page !== undefined) {
        translated = translated.replace('{{page}}', String(values.page))
      }
      if (values?.total !== undefined) {
        translated = translated.replace('{{total}}', String(values.total))
      }
      return translated
    },
  }),
}))

vi.mock('../api', () => ({
  confirmPricingSnapshotRefunded: vi.fn(),
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
  getPricingReconciliationSummary: vi.fn(),
  getRequestPricingSnapshots: vi.fn(),
}))

afterEach(cleanup)

test('shows pending pricing snapshots with reconciliation context', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 1,
      stale_reserved: 2,
      settled_last_24h: 12,
      refunded_last_24h: 3,
      oldest_anomaly_created_at: 1_800_000_000,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 1,
          request_id: 'request-pending',
          model_name: 'seedance-2.0',
          channel_id: 2,
          channel_name: 'video-provider',
          billing_mode: 'video_duration',
          purchase_price_version_id: 12,
          retail_price_version_id: 13,
          estimated_usage: '{"video_seconds":3}',
          actual_usage: '',
          created_at: 1_800_000_000,
          resolved_at: 1_800_000_100,
          resolved_by: 7,
          reserved_quota: 80000,
          settled_quota: 0,
          purchase_cost: '0.4',
          retail_amount: '0.8',
          currency: 'USD',
          status: 'pending',
          updated_at: 1_800_000_000,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPage />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByText('request-pending')).toBeInTheDocument()
  )
  expect(screen.getByText('seedance-2.0')).toBeInTheDocument()
  expect(screen.getByText('video-provider')).toBeInTheDocument()
  expect(screen.getAllByText('video_duration')).toHaveLength(2)
  expect(
    screen.getByRole('button', { name: 'Confirm Refunded' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View details' }))
  expect(screen.getByText('P#12 · R#13')).toBeInTheDocument()
  expect(screen.getByText(/"video_seconds": 3/)).toBeInTheDocument()
  expect(screen.getByText('#7')).toBeInTheDocument()
  expect(screen.getByText('0.4 USD')).toBeInTheDocument()
  expect(screen.getByText('0.8 USD')).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Purchase cost' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Base retail amount' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Estimated charge' })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Billed Amount' })
  ).toBeInTheDocument()
  expect(screen.getByText('Billing Anomalies')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Pricing Reconciliation' })
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Shows settlement failures and reservations still incomplete after 15 minutes.'
    )
  ).toBeInTheDocument()
  expect(screen.getByText('1 billing anomalies')).toBeInTheDocument()
  expect(screen.getByText('Pending anomalies')).toBeInTheDocument()
  expect(screen.getByText('Stale reservations')).toBeInTheDocument()
  expect(screen.getByText('Settled (24h)')).toBeInTheDocument()
  expect(screen.getByText('Refunded (24h)')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export CSV' })).toHaveAttribute(
    'href',
    '/api/pricing-admin/request-pricing-snapshots/export?reconciliation=true'
  )
  expect(getRequestPricingSnapshots).toHaveBeenCalledWith({
    reconciliation: true,
    status: undefined,
    billing_mode: undefined,
    created_from: undefined,
    created_to: undefined,
    keyword: undefined,
    page: 1,
    page_size: 20,
  })
})

test('confirms an audited refund after explicit confirmation', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 1,
      stale_reserved: 0,
      settled_last_24h: 0,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 1,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockResolvedValue({
    success: true,
    data: {
      items: [
        {
          id: 9,
          request_id: 'pending-refund',
          model_name: 'model',
          channel_id: 1,
          channel_name: 'channel',
          billing_mode: 'token',
          reserved_quota: 10,
          settled_quota: 0,
          purchase_cost: '0.01',
          retail_amount: '0.02',
          currency: 'USD',
          status: 'pending',
          updated_at: 1,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    },
  })
  vi.mocked(confirmPricingSnapshotRefunded).mockResolvedValue({
    success: true,
    data: { id: 9, status: 'refunded' },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  fireEvent.click(
    await screen.findByRole('button', { name: 'Confirm Refunded' })
  )
  expect(
    screen.getByText('Confirm this request as refunded?')
  ).toBeInTheDocument()
  const confirmationButton = screen
    .getAllByRole('button', { name: 'Confirm Refunded' })
    .at(-1)
  expect(confirmationButton).toBeDefined()
  if (confirmationButton) {
    fireEvent.click(confirmationButton)
  }

  await waitFor(() =>
    expect(vi.mocked(confirmPricingSnapshotRefunded).mock.calls[0]?.[0]).toBe(9)
  )
})

test('shows an explicit empty state when reconciliation is clear', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 0,
      stale_reserved: 0,
      settled_last_24h: 0,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 0,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockResolvedValue({
    success: true,
    data: {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByText('No billing anomalies')).toBeInTheDocument()
  )
})

test('loads the next reconciliation page and exposes navigation state', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 21,
      stale_reserved: 0,
      settled_last_24h: 0,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 1_800_000_000,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockImplementation(
    async (params = {}) => ({
      success: true,
      data: {
        items: [],
        total: 21,
        page: params.page ?? 1,
        page_size: 20,
      },
    })
  )
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  const previousButton = await screen.findByRole('button', {
    name: 'Previous',
  })
  const nextButton = screen.getByRole('button', { name: 'Next' })
  expect(previousButton).toBeDisabled()
  expect(nextButton).toBeEnabled()
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()

  fireEvent.click(nextButton)

  await waitFor(() =>
    expect(getRequestPricingSnapshots).toHaveBeenLastCalledWith({
      reconciliation: true,
      status: undefined,
      billing_mode: undefined,
      created_from: undefined,
      created_to: undefined,
      keyword: undefined,
      page: 2,
      page_size: 20,
    })
  )
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('searches reconciliation records and applies the keyword to CSV export', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 0,
      stale_reserved: 0,
      settled_last_24h: 0,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 0,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockResolvedValue({
    success: true,
    data: {
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  const searchInput = await screen.findByLabelText(
    'Search request ID, model, or channel'
  )
  fireEvent.change(searchInput, { target: { value: ' request/seedance ' } })
  fireEvent.submit(screen.getByRole('search'))

  await waitFor(() =>
    expect(getRequestPricingSnapshots).toHaveBeenLastCalledWith({
      reconciliation: true,
      status: undefined,
      billing_mode: undefined,
      created_from: undefined,
      created_to: undefined,
      keyword: 'request/seedance',
      page: 1,
      page_size: 20,
    })
  )
  expect(screen.getByRole('button', { name: 'Export CSV' })).toHaveAttribute(
    'href',
    '/api/pricing-admin/request-pricing-snapshots/export?reconciliation=true&keyword=request%2Fseedance'
  )
})

test('switches to all pricing records and exports the same view', async () => {
  vi.mocked(getPricingReconciliationSummary).mockResolvedValue({
    success: true,
    data: {
      pending: 0,
      stale_reserved: 0,
      settled_last_24h: 1,
      refunded_last_24h: 0,
      oldest_anomaly_created_at: 0,
    },
  })
  vi.mocked(getRequestPricingSnapshots).mockResolvedValue({
    success: true,
    data: { items: [], total: 1, page: 1, page_size: 20 },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  fireEvent.click(
    await screen.findByRole('button', { name: 'All pricing records' })
  )

  await waitFor(() =>
    expect(getRequestPricingSnapshots).toHaveBeenLastCalledWith({
      reconciliation: undefined,
      status: undefined,
      billing_mode: undefined,
      created_from: undefined,
      created_to: undefined,
      keyword: undefined,
      page: 1,
      page_size: 20,
    })
  )
  expect(screen.getByText('1 pricing records')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export CSV' })).toHaveAttribute(
    'href',
    '/api/pricing-admin/request-pricing-snapshots/export'
  )

  fireEvent.change(screen.getByLabelText('Status'), {
    target: { value: 'settled' },
  })
  fireEvent.change(screen.getByLabelText('Billing mode'), {
    target: { value: 'video_duration' },
  })
  await waitFor(() =>
    expect(getRequestPricingSnapshots).toHaveBeenLastCalledWith({
      reconciliation: undefined,
      status: 'settled',
      billing_mode: 'video_duration',
      created_from: undefined,
      created_to: undefined,
      keyword: undefined,
      page: 1,
      page_size: 20,
    })
  )
  expect(screen.getByRole('button', { name: 'Export CSV' })).toHaveAttribute(
    'href',
    '/api/pricing-admin/request-pricing-snapshots/export?status=settled&billing_mode=video_duration'
  )
})
