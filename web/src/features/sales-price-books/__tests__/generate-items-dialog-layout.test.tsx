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
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { getChannelModels } from '@/features/pricing-admin/api'

import { GenerateItemsDialog } from '../components/generate-items-dialog'

const draftVersion = {
  id: 1,
  price_book_id: 1,
  version: 1,
  status: 'draft' as const,
  cost_basis_strategy: 'max_eligible_cost',
  payment_fee_rate: '0.04',
  distribution_fee_rate: '0.05',
  operations_labor_rate: '0.02',
  total_variable_cost_rate: '0.11',
  effective_tax_rate: '0.16',
  target_net_margin: '0.03',
  minimum_margin_rate: '0.02',
  content_hash: '',
  created_at: 1,
  published_at: 0,
  remark: '',
}

const { generateSalesPriceBookItems } = vi.hoisted(() => ({
  generateSalesPriceBookItems: vi.fn(),
}))

vi.mock('@/features/pricing-admin/api', () => ({
  getPricingCatalogOptions: vi.fn().mockResolvedValue({
    data: { channels: [{ id: 1, name: 'Primary channel' }] },
  }),
  getChannelModels: vi.fn().mockResolvedValue({
    data: {
      items: [
        {
          id: 11,
          channel_id: 1,
          channel_name: 'Primary channel',
          model_id: 7,
          model_name: 'openai/gpt-test',
          currency: 'USD',
          upstream_model_name: 'gpt-test',
          status: 1,
          routing_enabled: true,
          priority: 0,
          weight: 0,
          region: '',
          active_purchase_price_version_id: 3,
          active_purchase_price_version: 1,
          purchase_pricing_mode: 'discount',
          purchase_discount: '0.85',
        },
      ],
      total: 1,
      page: 1,
      page_size: 200,
    },
  }),
  getChannelModelIds: vi.fn().mockResolvedValue({
    data: [
      {
        id: 11,
        model_id: 7,
        model_name: 'openai/gpt-test',
        channel_name: 'Primary channel',
      },
    ],
  }),
}))

vi.mock('../api', () => ({
  generateSalesPriceBookItems: (...args: unknown[]) =>
    generateSalesPriceBookItems(...args),
  getSalesPriceBookItems: vi.fn().mockResolvedValue({
    data: [{ model_id: 7 }],
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let result = key
      for (const [name, value] of Object.entries(values ?? {})) {
        result = result.replace(`{{${name}}}`, String(value))
      }
      return result
    },
  }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('uses a large workspace and keeps the model list independently scrollable', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <GenerateItemsDialog
        open
        versionId={1}
        version={draftVersion}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  )

  const dialog = screen.getByTestId('generate-items-dialog')
  expect(dialog).toHaveClass(
    'h-[min(92vh,64rem)]',
    'w-[calc(100vw-2rem)]',
    'sm:w-[min(96vw,96rem)]',
    'sm:max-w-[min(96vw,96rem)]'
  )

  const body = screen.getByTestId('generate-items-dialog-body')
  expect(body).toHaveClass('min-h-0', 'flex-1', 'lg:overflow-hidden')

  await waitFor(() => {
    expect(screen.getByText('openai/gpt-test')).toBeInTheDocument()
  })
  expect(screen.getByText('Generated')).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Set special parameters' })
  ).toBeInTheDocument()
  expect(getChannelModels).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 1,
      purchase_status: 'published',
    })
  )
  expect(screen.getByTestId('supported-channel-model-scroll')).toHaveClass(
    'min-h-48',
    'flex-1',
    'overflow-auto'
  )
})

test('previews the final logical models before generating prices', async () => {
  generateSalesPriceBookItems.mockResolvedValue({
    data: {
      batch: { review_count: 0 },
      generated_items: [],
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

  render(
    <QueryClientProvider client={queryClient}>
      <GenerateItemsDialog
        open
        versionId={7}
        version={{ ...draftVersion, id: 7 }}
        initialChannelModelIds={[11]}
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>
  )

  expect(
    await screen.findByRole('checkbox', {
      name: 'Select openai/gpt-test',
    })
  ).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(
    screen.getByRole('button', { name: 'Generate selected models' })
  )

  expect(generateSalesPriceBookItems).not.toHaveBeenCalled()
  expect(
    await screen.findByRole('heading', { name: 'Confirm price generation' })
  ).toBeInTheDocument()
  const confirmation = screen.getByRole('alertdialog')
  expect(confirmation).toHaveTextContent(
    'Selected channel models: 1; logical models to generate: 1.'
  )
  expect(within(confirmation).getByText('openai/gpt-test')).toBeInTheDocument()
  expect(within(confirmation).getByText('Primary channel')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Generate 1 model' }))

  await waitFor(() => {
    expect(generateSalesPriceBookItems).toHaveBeenCalled()
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sales-price-books', 'version-diff'],
    })
  })
})
