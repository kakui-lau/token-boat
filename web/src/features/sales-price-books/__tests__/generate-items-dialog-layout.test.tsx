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
      <GenerateItemsDialog open versionId={1} onOpenChange={vi.fn()} />
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
      <GenerateItemsDialog open versionId={7} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  )

  fireEvent.click(
    await screen.findByRole('checkbox', {
      name: 'Select openai/gpt-test',
    })
  )
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
