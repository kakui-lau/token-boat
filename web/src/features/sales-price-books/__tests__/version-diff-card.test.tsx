// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
        result = result.replaceAll(`{{${name}}}`, String(value))
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
}

test('shows version reference prices and filters by change type', async () => {
  const baseVersion = version(11, 1)
  const targetVersion = version(12, 2)
  compareSalesPriceBookVersions.mockResolvedValue({
    data: {
      base_version: baseVersion,
      target_version: targetVersion,
      policy_changes: [],
      added_count: 1,
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
          old_channel_margins: [],
          new_channel_margins: [
            {
              channel_model_id: 51,
              channel_name: 'Primary channel',
              purchase_price_version_id: 42,
              reference_cost: '1.2',
              margin_rate: '0.04',
              meets_minimum_margin: true,
            },
          ],
        },
        {
          model_id: 32,
          model_name: 'google/new-model',
          change_type: 'added',
          old_reference_cost: '',
          new_reference_cost: '2',
          old_reference_price: '',
          new_reference_price: '2.4',
          price_change_rate: '',
          margin_before: '',
          margin_after: '0.03',
          old_purchase_version_ids: [],
          new_purchase_version_ids: [43],
          risk_codes: [],
          old_channel_margins: [],
          new_channel_margins: [],
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
  expect(
    screen.getByRole('columnheader', {
      name: 'Sales reference price Current active version → Edited version',
    })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', {
      name: 'Purchase reference cost Current active version → Edited version',
    })
  ).toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', {
      name: 'Net margin rate Current active version → Edited version',
    })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('columnheader', { name: 'Old reference price' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('columnheader', { name: 'Purchase price sources' })
  ).toBeInTheDocument()
  expect(screen.getByText('20%')).toBeInTheDocument()
  expect(screen.getByText('Primary channel: 4%')).toBeInTheDocument()
  expect(screen.getByText('Total rows: 2')).toBeInTheDocument()
  expect(compareSalesPriceBookVersions).toHaveBeenCalledWith(11, 12)
  const changedRow = screen.getByText('openai/test-model').closest('tr')
  if (!changedRow) throw new Error('changed model row was not rendered')
  const changedRowQueries = within(changedRow)
  expect(changedRowQueries.getByText('Changed')).toHaveClass('text-warning')
  expect(screen.getByText('USD 1.8')).toHaveClass('bg-warning/10')
  expect(screen.getByText('20%')).toHaveClass('text-warning')
  expect(screen.getByText('USD 1.2')).toHaveClass('bg-warning/10')
  expect(screen.getByText('2.5%')).toHaveClass('bg-warning/10')
  expect(screen.getByText('Primary channel: 4%')).not.toHaveClass(
    'text-warning'
  )
  expect(screen.getByText('USD 1.5')).not.toHaveClass('text-destructive')
  const addedRow = screen.getByText('google/new-model').closest('tr')
  if (!addedRow) throw new Error('added model row was not rendered')
  expect(within(addedRow).getByText('Added')).toHaveClass('text-success')
  expect(screen.getByText('google/new-model')).not.toHaveClass('text-success')
  expect(screen.getByText('USD 2.4')).toHaveClass('bg-success/10')
  expect(changedRowQueries.getByText('Current active version')).toBeVisible()
  expect(changedRowQueries.getByText('#41')).toBeVisible()
  expect(changedRowQueries.getByText('Edited version')).toBeVisible()
  expect(changedRowQueries.getByText('Primary channel (#42)')).toBeVisible()
  expect(changedRowQueries.getByText('Removed source: #41')).toBeVisible()
  expect(
    changedRowQueries.getByText('Added source: Primary channel (#42)')
  ).toBeVisible()

  fireEvent.change(screen.getByRole('combobox', { name: 'Change type' }), {
    target: { value: 'unchanged' },
  })
  await waitFor(() => {
    expect(
      screen.getByText('No version differences match the filters')
    ).toBeInTheDocument()
    expect(screen.getByText('Total rows: 0')).toBeInTheDocument()
  })
})

test('renders removed items when the API returns null collections', async () => {
  const baseVersion = version(21, 1)
  const targetVersion = version(22, 2)
  compareSalesPriceBookVersions.mockResolvedValue({
    data: {
      base_version: baseVersion,
      target_version: targetVersion,
      policy_changes: [
        {
          field: 'cost_basis_strategy',
          old_value: 'min_eligible_cost',
          new_value: 'max_eligible_cost',
        },
        {
          field: 'operations_labor_rate',
          old_value: '0.02',
          new_value: '0.01',
        },
      ],
      added_count: 0,
      changed_count: 0,
      removed_count: 1,
      unchanged_count: 0,
      review_count: 1,
      items: [
        {
          model_id: 41,
          model_name: 'openai/removed-model',
          change_type: 'removed',
          old_reference_cost: '1',
          new_reference_cost: '',
          old_reference_price: '1.5',
          new_reference_price: '',
          price_change_rate: '',
          margin_before: '0.03',
          margin_after: '',
          old_purchase_version_ids: [51],
          new_purchase_version_ids: null,
          risk_codes: ['model_removed'],
          old_channel_margins: [
            {
              channel_model_id: 61,
              channel_name: 'Legacy channel',
              purchase_price_version_id: 51,
              reference_cost: '1',
              margin_rate: '0.03',
              meets_minimum_margin: true,
            },
          ],
          new_channel_margins: null,
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

  expect(await screen.findByText('openai/removed-model')).toBeInTheDocument()
  expect(screen.getByText('Model removed')).toBeInTheDocument()
  expect(screen.getByText('Comparing v1 (old) → v2 (new).')).toBeInTheDocument()
  expect(
    screen.getByText(
      'Version v2 has no model prices, so all 1 models from v1 are shown as removed. Generate prices for v2 first.'
    )
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Cost basis: Minimum eligible purchase cost → Maximum eligible purchase cost'
    )
  ).toBeInTheDocument()
  expect(screen.getByText('Operations labor cost: 2% → 1%')).toBeInTheDocument()
  expect(
    screen.getByText(
      'Cost basis: Minimum eligible purchase cost → Maximum eligible purchase cost'
    )
  ).toHaveClass('text-warning')
  expect(screen.getByText('Operations labor cost: 2% → 1%')).toHaveClass(
    'text-warning'
  )
  const removedRow = screen.getByText('openai/removed-model').closest('tr')
  if (!removedRow) throw new Error('removed model row was not rendered')
  expect(within(removedRow).getByText('Removed')).toHaveClass(
    'text-destructive'
  )
  expect(screen.getByText('USD 1.5')).not.toHaveClass('text-destructive')
  expect(screen.getByText('openai/removed-model')).not.toHaveClass(
    'text-destructive'
  )
  expect(screen.getByText('Model removed')).toHaveClass('text-destructive')
  expect(screen.getByText('Legacy channel (#51)')).toBeVisible()
  expect(
    screen.getByText('Model is not included in the edited version.')
  ).toBeVisible()
  expect(screen.queryByText('USD 0')).not.toBeInTheDocument()
})

test('lists items without review risks before items requiring review', async () => {
  const baseVersion = version(31, 1)
  const targetVersion = version(32, 2)
  const diffItem = (
    modelId: number,
    modelName: string,
    riskCodes: string[]
  ) => ({
    model_id: modelId,
    model_name: modelName,
    change_type: 'changed',
    old_reference_cost: '1',
    new_reference_cost: '1.1',
    old_reference_price: '1.5',
    new_reference_price: '1.6',
    price_change_rate: '0.0667',
    margin_before: '0.03',
    margin_after: '0.03',
    old_purchase_version_ids: [61],
    new_purchase_version_ids: [62],
    risk_codes: riskCodes,
    old_channel_margins: [],
    new_channel_margins: [],
  })
  compareSalesPriceBookVersions.mockResolvedValue({
    data: {
      base_version: baseVersion,
      target_version: targetVersion,
      policy_changes: [],
      added_count: 0,
      changed_count: 2,
      removed_count: 0,
      unchanged_count: 0,
      review_count: 1,
      items: [
        diffItem(71, 'openai/review-model', ['below_minimum_margin']),
        diffItem(72, 'openai/healthy-model', []),
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

  expect(await screen.findByText('openai/healthy-model')).toBeInTheDocument()
  const rows = screen.getAllByRole('row').slice(1)
  expect(within(rows[0]).getByText('openai/healthy-model')).toBeInTheDocument()
  expect(within(rows[1]).getByText('openai/review-model')).toBeInTheDocument()
})
