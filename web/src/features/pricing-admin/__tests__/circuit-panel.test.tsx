// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { getPricingCircuitOverview } from '../api'
import { PricingCircuitPanel } from '../components/pricing-circuit-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../api', () => ({
  getPricingCircuitOverview: vi.fn(),
}))

afterEach(cleanup)

test('shows open channels and recent circuit transitions', async () => {
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: {
      channels: [
        {
          channel_id: 12,
          state: 'open',
          consecutive_failures: 3,
          open_until: 1_800_000_030,
          probe_until: 0,
        },
      ],
      events: [
        {
          id: 1,
          channel_id: 12,
          event: 'opened',
          status_code: 503,
          occurred_at: 1_800_000_000,
        },
      ],
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingCircuitPanel />
    </QueryClientProvider>
  )

  await waitFor(() => expect(screen.getByText('Open')).toBeInTheDocument())
  expect(screen.getAllByText('#12')).toHaveLength(2)
  expect(screen.getByText('Circuit opened')).toBeInTheDocument()
  expect(screen.getByText('503')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})

test('shows healthy and empty-history states when no circuit is active', async () => {
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: { channels: [], events: [] },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingCircuitPanel />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByText('All channels are healthy')).toBeInTheDocument()
  )
  expect(screen.getByText('No circuit events')).toBeInTheDocument()
})
