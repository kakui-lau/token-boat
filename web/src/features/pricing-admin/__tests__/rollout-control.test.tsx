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

import { getPricingRolloutPolicy, updatePricingRolloutPolicy } from '../api'
import { PricingRolloutControl } from '../components/pricing-rollout-control'

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
  getPricingRolloutPolicy: vi.fn(),
  updatePricingRolloutPolicy: vi.fn(),
}))

afterEach(cleanup)

test('loads and submits rollout percentage, groups, users, and shadow mode', async () => {
  vi.mocked(getPricingRolloutPolicy).mockResolvedValue({
    success: true,
    data: {
      percent: 10,
      models: ['gpt-5'],
      groups: ['vip'],
      user_ids: [42],
      shadow_enabled: false,
      runtime: {
        total_channel_models: 31,
        v2_channel_models: 2,
        complete_group_model_scopes: 1,
        eligible_group_model_scopes: 1,
        live_traffic_enabled: true,
      },
    },
  })
  vi.mocked(updatePricingRolloutPolicy).mockResolvedValue({
    success: true,
    data: {
      percent: 50,
      models: ['gpt-5', 'claude-4'],
      groups: ['vip', 'internal'],
      user_ids: [42],
      shadow_enabled: true,
      runtime: {
        total_channel_models: 31,
        v2_channel_models: 2,
        complete_group_model_scopes: 1,
        eligible_group_model_scopes: 1,
        live_traffic_enabled: true,
      },
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PricingRolloutControl />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByLabelText('Traffic Percentage')).toHaveValue(10)
  )
  expect(
    screen.getByText('V2 routing and billing are active')
  ).toBeInTheDocument()
  expect(screen.getByText('2 of 31 channel models use V2')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Traffic Percentage'), {
    target: { value: '50' },
  })
  fireEvent.change(screen.getByLabelText('Models'), {
    target: { value: 'gpt-5, claude-4' },
  })
  fireEvent.change(screen.getByLabelText('Groups'), {
    target: { value: 'vip, internal' },
  })
  fireEvent.click(
    screen.getByRole('switch', { name: 'Shadow comparison only' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(updatePricingRolloutPolicy).toHaveBeenCalledWith({
      percent: 50,
      models: ['gpt-5', 'claude-4'],
      groups: ['vip', 'internal'],
      user_ids: [42],
      shadow_enabled: true,
    })
  )
})

test('disables saving when traffic percentage is outside the supported range', async () => {
  vi.mocked(getPricingRolloutPolicy).mockResolvedValue({
    success: true,
    data: {
      percent: 101,
      models: [],
      groups: [],
      user_ids: [],
      shadow_enabled: false,
      runtime: {
        total_channel_models: 31,
        v2_channel_models: 0,
        complete_group_model_scopes: 0,
        eligible_group_model_scopes: 0,
        live_traffic_enabled: false,
      },
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <PricingRolloutControl />
    </QueryClientProvider>
  )

  await waitFor(() =>
    expect(screen.getByLabelText('Traffic Percentage')).toHaveValue(101)
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  )
})
