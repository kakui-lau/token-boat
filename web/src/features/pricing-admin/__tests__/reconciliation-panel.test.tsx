// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { getRequestPricingSnapshots } from '../api'
import { PricingReconciliationPanel } from '../components/pricing-reconciliation-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { total?: number }) =>
      values?.total === undefined
        ? key
        : key.replace('{{total}}', String(values.total)),
  }),
}))

vi.mock('../api', () => ({
  getRequestPricingSnapshots: vi.fn(),
}))

afterEach(cleanup)

test('shows pending pricing snapshots with reconciliation context', async () => {
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
      <PricingReconciliationPanel />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByText('request-pending')).toBeInTheDocument()
  )
  expect(screen.getByText('seedance-2.0')).toBeInTheDocument()
  expect(screen.getByText('video-provider')).toBeInTheDocument()
  expect(screen.getByText('video_duration')).toBeInTheDocument()
  expect(screen.getByText('Billing Anomalies')).toBeInTheDocument()
  expect(
    screen.getByText(
      'Shows settlement failures and reservations still incomplete after 15 minutes.'
    )
  ).toBeInTheDocument()
  expect(screen.getByText('1 billing anomalies')).toBeInTheDocument()
  expect(getRequestPricingSnapshots).toHaveBeenCalledWith({
    reconciliation: true,
    page: 1,
    page_size: 20,
  })
})

test('shows an explicit empty state when reconciliation is clear', async () => {
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
