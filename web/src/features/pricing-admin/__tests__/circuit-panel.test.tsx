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

import {
  getPricingCircuitEvents,
  getPricingCircuitOverview,
  resetPricingCircuit,
} from '../api'
import { PricingCircuitPanel } from '../components/pricing-circuit-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: 100 } } }),
}))

vi.mock('../api', () => ({
  getPricingCircuitEvents: vi.fn().mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 100 },
  }),
  getPricingCircuitOverview: vi.fn(),
  resetPricingCircuit: vi.fn(),
}))

afterEach(cleanup)

test('shows open channels and recent circuit transitions', async () => {
  vi.mocked(getPricingCircuitEvents).mockResolvedValueOnce({
    success: true,
    data: {
      items: [
        {
          id: 1,
          channel_id: 12,
          channel_name: 'video-provider',
          model_id: 201,
          model_name: 'byteplus/seedance-2.0-ep',
          event: 'opened',
          status_code: 503,
          occurred_at: 1_800_000_000,
        },
      ],
      total: 1,
      page: 1,
      page_size: 100,
    },
  })
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: {
      distributed: true,
      enabled: true,
      channels: [
        {
          channel_id: 12,
          channel_name: 'video-provider',
          model_id: 201,
          model_name: 'byteplus/seedance-2.0-ep',
          state: 'open',
          consecutive_failures: 3,
          open_until: 1_800_000_030,
          probe_until: 0,
          success_count: 97,
          failure_count: 3,
          success_rate: 0.97,
          average_latency_ms: 245.4,
        },
      ],
      events: [
        {
          id: 1,
          channel_id: 12,
          channel_name: 'video-provider',
          model_id: 201,
          model_name: 'byteplus/seedance-2.0-ep',
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

  await waitFor(() => expect(screen.getByText('#12')).toBeInTheDocument())
  expect(screen.getAllByText('video-provider')).toHaveLength(3)
  expect(screen.getAllByText('byteplus/seedance-2.0-ep')).toHaveLength(2)
  expect(screen.getAllByText('Circuit opened')).toHaveLength(2)
  expect(screen.getByText('503')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
  expect(screen.getAllByText('97.00%')).toHaveLength(2)
  expect(screen.getAllByText('245 ms')).toHaveLength(2)
})

test('requires confirmation before manually resetting a channel circuit', async () => {
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: {
      distributed: false,
      enabled: true,
      channels: [
        {
          channel_id: 15,
          channel_name: 'recoverable-provider',
          model_id: 202,
          model_name: 'test-model',
          state: 'open',
          consecutive_failures: 3,
          open_until: 1_800_000_030,
          probe_until: 0,
          success_count: 10,
          failure_count: 3,
          success_rate: 0.91,
          average_latency_ms: 500,
        },
      ],
      events: [],
    },
  })
  vi.mocked(resetPricingCircuit).mockResolvedValue({
    success: true,
    data: { channel_id: 15, model_id: 202, reset: true },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PricingCircuitPanel />
    </QueryClientProvider>
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Reset circuit' }))
  expect(resetPricingCircuit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  await waitFor(() =>
    expect(vi.mocked(resetPricingCircuit).mock.calls[0]).toEqual([15, 202])
  )
})

test('shows healthy and empty-history states when no circuit is active', async () => {
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: { channels: [], events: [], distributed: false, enabled: true },
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

test('shows that circuit monitoring is disabled', async () => {
  vi.mocked(getPricingCircuitOverview).mockResolvedValue({
    success: true,
    data: { channels: [], events: [], distributed: true, enabled: false },
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
    expect(
      screen.getByText(
        'Circuit monitoring is disabled. All channel-model routes remain eligible.'
      )
    ).toBeInTheDocument()
  )
})
