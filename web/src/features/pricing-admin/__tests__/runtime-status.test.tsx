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

test('shows that complete pricing scopes use purchase routing and sales billing', async () => {
  vi.mocked(getPricingRuntimeStatus).mockResolvedValue({
    success: true,
    data: {
      total_channel_models: 31,
      priced_channel_models: 2,
      complete_group_model_scopes: 1,
      live_traffic_enabled: true,
      distributed_circuit_state: true,
      route_score_weights: {
        cost: 0.5,
        success: 0.25,
        latency: 0.15,
        quality: 0.1,
      },
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
      screen.getByText('Pricing routing and billing are active')
    ).toBeInTheDocument()
  )
  expect(
    screen.getByText('2 of 31 channel models have purchase pricing')
  ).toBeInTheDocument()
  expect(screen.getByText('1 model/group scopes are ready')).toBeInTheDocument()
  expect(
    screen.getByText('Distributed circuit state is active')
  ).toBeInTheDocument()
})

test('shows pricing unavailable and warns about local circuit state', async () => {
  vi.mocked(getPricingRuntimeStatus).mockResolvedValue({
    success: true,
    data: {
      total_channel_models: 31,
      priced_channel_models: 0,
      complete_group_model_scopes: 0,
      live_traffic_enabled: false,
      distributed_circuit_state: false,
      route_score_weights: {
        cost: 0.5,
        success: 0.25,
        latency: 0.15,
        quality: 0.1,
      },
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
    expect(screen.getByText('Pricing routing unavailable')).toBeInTheDocument()
  )
  expect(
    screen.getByText(
      'Circuit state is local to this instance; configure Redis before running multiple replicas.'
    )
  ).toBeInTheDocument()
})
