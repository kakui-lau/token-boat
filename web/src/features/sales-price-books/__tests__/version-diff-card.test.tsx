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

import { VersionDiffCard } from '../components/version-diff-card'
import type { SalesPriceBookVersion } from '../types'

const compareSalesPriceBookVersions = vi.fn()

vi.mock('../api', () => ({
  compareSalesPriceBookVersions: (...args: unknown[]) =>
    compareSalesPriceBookVersions(...args),
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function version(id: number, value: number): SalesPriceBookVersion {
  return {
    id,
    price_book_id: 1,
    version: value,
    status: value === 1 ? 'active' : 'draft',
    cost_basis_strategy: 'max_eligible_cost',
    reprice_mode: 'review',
    payment_fee_rate: '0.04',
    distribution_fee_rate: '0.05',
    operations_labor_rate: '0.02',
    total_variable_cost_rate: '0.11',
    effective_tax_rate: '0.16',
    target_net_margin: '0.03',
    minimum_margin_rate: '0.02',
    rounding_mode: 'ceil',
    rounding_scale: 5,
    risk_action: 'exclude_channel',
    content_hash: '',
    created_at: 1,
    published_at: 0,
    remark: '',
  }
}

test('shows version reference prices and filters by change type', async () => {
  const baseVersion = version(11, 1)
  const targetVersion = version(12, 2)
  compareSalesPriceBookVersions.mockResolvedValue({
    data: {
      base_version: baseVersion,
      target_version: targetVersion,
      policy_changes: [],
      added_count: 0,
      changed_count: 1,
      removed_count: 0,
      unchanged_count: 0,
      review_count: 0,
      items: [
        {
          model_id: 31,
          model_name: 'openai/test-model',
          change_type: 'changed',
          old_reference_cost: '1',
          new_reference_cost: '1.2',
          old_reference_price: '1.5',
          new_reference_price: '1.8',
          price_change_rate: '0.2',
          margin_before: '0.03',
          margin_after: '0.025',
          old_purchase_version_ids: [41],
          new_purchase_version_ids: [42],
          risk_codes: [],
        },
      ],
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <VersionDiffCard
        baseVersion={baseVersion}
        targetVersion={targetVersion}
      />
    </QueryClientProvider>
  )

  expect(await screen.findByText('openai/test-model')).toBeInTheDocument()
  expect(screen.getByText('20%')).toBeInTheDocument()
  expect(compareSalesPriceBookVersions).toHaveBeenCalledWith(11, 12)

  fireEvent.change(screen.getByRole('combobox', { name: 'Change type' }), {
    target: { value: 'unchanged' },
  })
  await waitFor(() => {
    expect(
      screen.getByText('No version differences match the filters')
    ).toBeInTheDocument()
  })
})
