// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ChangeBatchesPanel } from '../components/change-batches-panel'

const getPricingChangeBatches = vi.fn()
const getPricingChangeBatch = vi.fn()
const publishGeneratedPricingChangeBatch = vi.fn()
const reconcilePricingAutomation = vi.fn()

vi.mock('../api', () => ({
  getPricingChangeBatches: (...args: unknown[]) =>
    getPricingChangeBatches(...args),
  getPricingChangeBatch: (...args: unknown[]) => getPricingChangeBatch(...args),
  publishGeneratedPricingChangeBatch: (...args: unknown[]) =>
    publishGeneratedPricingChangeBatch(...args),
  reconcilePricingAutomation: (...args: unknown[]) =>
    reconcilePricingAutomation(...args),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('loads 200 change batches per page and shows model-level details', async () => {
  getPricingChangeBatches.mockResolvedValue({
    data: {
      items: [
        {
          id: 72,
          batch_no: 'PB-72',
          trigger_type: 'purchase_price_publish',
          status: 'review_required',
          total_count: 1,
          changed_count: 1,
          unchanged_count: 0,
          review_count: 1,
          requested_by: 9,
          requested_by_username: 'pricing-admin',
          created_at: 1,
        },
      ],
      total: 1,
      page: 1,
      page_size: 200,
    },
  })
  getPricingChangeBatch.mockResolvedValue({
    data: {
      batch: { id: 72, batch_no: 'PB-72' },
      items: [
        {
          id: 81,
          model_id: 31,
          model_name: 'openai/test-model',
          target_type: 'sales_price_book_item',
          action: 'update',
          old_reference_price: '1',
          new_reference_price: '1.2',
          old_reference_cost: '0.7',
          new_reference_cost: '0.8',
          margin_before: '0.03',
          margin_after: '0.02',
          risk_code: 'below_minimum_margin',
        },
      ],
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <ChangeBatchesPanel />
    </QueryClientProvider>
  )

  expect(await screen.findByText('openai/test-model')).toBeInTheDocument()
  await waitFor(() => {
    expect(getPricingChangeBatches).toHaveBeenCalledWith({
      keyword: undefined,
      status: undefined,
      trigger_type: undefined,
      p: 1,
      page_size: 200,
    })
    expect(getPricingChangeBatch).toHaveBeenCalledWith(72)
  })
  expect(screen.getByText('pricing-admin')).toBeInTheDocument()
  expect(screen.getByText('below_minimum_margin')).toBeInTheDocument()
})
