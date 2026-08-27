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
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createSalesPriceBookVersion } from '../api'
import { CreateVersionDialog } from '../components/create-version-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../api', () => ({
  createSalesPriceBookVersion: vi.fn(),
}))

vi.mock('@/lib/handle-server-error', () => ({
  handleServerError: vi.fn(),
}))

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('derives the variable cost rate from payment, distribution, and operations costs', async () => {
  vi.mocked(createSalesPriceBookVersion).mockResolvedValue({
    success: true,
    data: { id: 91 },
  } as never)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <CreateVersionDialog open priceBookId={17} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  )

  expect(screen.getByDisplayValue('11')).toHaveAttribute('readonly')
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

  await waitFor(() => {
    expect(createSalesPriceBookVersion).toHaveBeenCalledWith(
      17,
      expect.objectContaining({
        payment_fee_rate: '0.04',
        distribution_fee_rate: '0.05',
        operations_labor_rate: '0.02',
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
      })
    )
  })
})

test('shows readable cost basis labels and explains the selected strategy', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <CreateVersionDialog open priceBookId={17} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  )

  const strategy = screen.getByRole('combobox', {
    name: 'Cost basis strategy',
  })
  expect(strategy).toHaveTextContent(
    'Maximum eligible purchase cost (recommended)'
  )
  expect(strategy).not.toHaveTextContent('max_eligible_cost')
  expect(
    screen.getByText(
      'Uses the highest cost from the selected active purchase prices to protect margin when routing changes. Recommended for TOC and most TOB price books.'
    )
  ).toBeVisible()

  fireEvent.click(strategy)
  const minimumCost = screen.getByRole('option', {
    name: 'Minimum eligible purchase cost',
  })
  fireEvent.pointerDown(minimumCost, { button: 0 })
  fireEvent.pointerUp(minimumCost, { button: 0 })
  fireEvent.click(minimumCost)

  await waitFor(() => {
    expect(strategy).toHaveTextContent('Minimum eligible purchase cost')
    expect(
      screen.getByText(
        'Uses the lowest cost from the selected active purchase prices. Use only when routing is guaranteed to stay on a low-cost channel; otherwise margin may fall below the minimum.'
      )
    ).toBeVisible()
  })
})
