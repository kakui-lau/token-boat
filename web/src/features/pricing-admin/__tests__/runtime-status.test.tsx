// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { getPricingRuntimeStatus } from '../api'
import { PricingRuntimeStatus } from '../components/pricing-runtime-status'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, number>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        key
      ),
  }),
}))

vi.mock('../api', () => ({
  getPricingRuntimeStatus: vi.fn(),
}))

afterEach(cleanup)

test('shows that complete V2 scopes immediately use new routing and billing', async () => {
  vi.mocked(getPricingRuntimeStatus).mockResolvedValue({
    success: true,
    data: {
      total_channel_models: 31,
      v2_channel_models: 2,
      complete_group_model_scopes: 1,
      live_traffic_enabled: true,
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingRuntimeStatus />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(
      screen.getByText('V2 routing and billing are active')
    ).toBeInTheDocument()
  )
  expect(screen.getByText('2 of 31 channel models use V2')).toBeInTheDocument()
  expect(screen.getByText('1 model/group scopes are ready')).toBeInTheDocument()
})

test('shows legacy billing when no complete V2 scope exists', async () => {
  vi.mocked(getPricingRuntimeStatus).mockResolvedValue({
    success: true,
    data: {
      total_channel_models: 31,
      v2_channel_models: 0,
      complete_group_model_scopes: 0,
      live_traffic_enabled: false,
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingRuntimeStatus />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByText('Legacy billing active')).toBeInTheDocument()
  )
})
