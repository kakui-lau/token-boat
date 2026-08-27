// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ModelPriceTable } from '../components/model-price-table'
import { PriceBookVersionTable } from '../components/price-book-version-table'
import { ReviewItemDialog } from '../components/review-item-dialog'
import type { SalesPriceBookItem, SalesPriceBookVersion } from '../types'

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
})

function version(
  id: number,
  value: number,
  status: SalesPriceBookVersion['status']
): SalesPriceBookVersion {
  return {
    id,
    price_book_id: 1,
    version: value,
    status,
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
    published_at: status === 'active' ? 1 : 0,
    remark: '',
  }
}

function modelPrice(): SalesPriceBookItem {
  return {
    id: 1,
    price_book_version_id: 1,
    model_id: 1,
    model_name: 'openai/gpt-test',
    status: 'enabled',
    billing_mode: 'token',
    price_structure: 'expression',
    price_components: '',
    sales_billing_expr: 'v2:(p * 1.170568561872909700)',
    sales_expr_hash: '',
    expression_source: 'generated',
    expression_schema_version: 'v2',
    pricing_method: 'cost_plus',
    selling_factor: '1.170568561872909700',
    purchase_discount: '0.7',
    sales_discount: '0.819397993311036790',
    official_discount: '',
    minimum_margin_override: '0.02',
    currency: 'USD',
    remark: '',
  }
}

function reviewModelPrice(): SalesPriceBookItem {
  return {
    ...modelPrice(),
    status: 'review_required',
    review_risk_code: 'below_minimum_margin',
    review_reason: '',
  } as SalesPriceBookItem
}

test('shows the active version first and keeps cancelled versions collapsed', () => {
  const versions = [
    version(6, 6, 'draft'),
    version(5, 5, 'cancelled'),
    version(1, 1, 'active'),
  ]

  render(
    <PriceBookVersionTable
      versions={versions}
      currentVersionId={1}
      selectedVersionId={1}
      isPublishing={false}
      isCloning={false}
      onSelect={vi.fn()}
      onGenerate={vi.fn()}
      onPublish={vi.fn()}
      onDeleteDraft={vi.fn()}
      onClone={vi.fn()}
    />
  )

  const visibleRows = screen.getAllByRole('row')
  expect(visibleRows[1]).toHaveTextContent('v1')
  expect(screen.queryByText('v5')).not.toBeInTheDocument()
  expect(screen.getByText('Total rows: 2')).toBeInTheDocument()

  fireEvent.click(
    screen.getByRole('button', { name: 'Show 1 historical versions' })
  )
  expect(screen.getByText('v5')).toBeInTheDocument()
  expect(screen.getByText('Total rows: 1')).toBeInTheDocument()
})

test('makes switching pricing versions explicit and identifies the viewed version', () => {
  const onSelect = vi.fn()

  render(
    <PriceBookVersionTable
      versions={[version(2, 2, 'draft'), version(1, 1, 'active')]}
      currentVersionId={1}
      selectedVersionId={1}
      isPublishing={false}
      isCloning={false}
      onSelect={onSelect}
      onGenerate={vi.fn()}
      onPublish={vi.fn()}
      onDeleteDraft={vi.fn()}
      onClone={vi.fn()}
    />
  )

  const currentRow = screen.getByRole('row', { name: /v1/ })
  expect(currentRow).toHaveAttribute('aria-selected', 'true')
  expect(within(currentRow).getByText('Currently billed')).toBeInTheDocument()
  expect(within(currentRow).getByText('Viewing')).toBeInTheDocument()

  const draftRow = screen.getByRole('row', { name: /v2/ })
  fireEvent.click(
    within(draftRow).getByRole('button', { name: 'View details' })
  )
  expect(onSelect).toHaveBeenCalledWith(2)
})

test('shows a readable multiplier and reveals the technical formula on demand', () => {
  const activeVersion = version(1, 1, 'active')

  render(
    <ModelPriceTable
      version={activeVersion}
      items={[modelPrice()]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReview={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  expect(screen.getByText('Purchase cost × 1.1706')).toBeInTheDocument()
  expect(screen.getByText('Purchase Discount')).toBeInTheDocument()
  expect(screen.getByText('Sales discount')).toBeInTheDocument()
  expect(screen.getByText('7/10 (70% of official price)')).toBeInTheDocument()
  expect(
    screen.getByText('8.194/10 (81.9398% of official price)')
  ).toBeInTheDocument()
  expect(screen.getByText('Total rows: 1')).toBeInTheDocument()
  expect(
    screen.queryByText('v2:(p * 1.170568561872909700)')
  ).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'View formula' }))
  expect(screen.getByText('v2:(p * 1.170568561872909700)')).toBeInTheDocument()
})

test('shows the review reason before offering review actions', () => {
  const draftVersion = version(2, 2, 'draft')

  render(
    <ModelPriceTable
      version={draftVersion}
      items={[reviewModelPrice()]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReview={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  expect(screen.getByText('Review reason')).toBeInTheDocument()
  expect(screen.getAllByText('Below minimum margin')).toHaveLength(2)
  expect(screen.getByRole('alert')).toHaveTextContent(
    '1 model prices require review'
  )
  expect(screen.getByRole('button', { name: 'Accept risk' })).toBeEnabled()
})

test('deletes a model price from a draft after confirmation', () => {
  const onDelete = vi.fn()

  render(
    <ModelPriceTable
      version={version(2, 2, 'draft')}
      items={[modelPrice()]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={onDelete}
      onReview={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByRole('alertdialog')).toHaveTextContent(
    'This action cannot be undone.'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(onDelete).toHaveBeenCalledWith(1)
})

test('does not offer model price deletion for an active version', () => {
  render(
    <ModelPriceTable
      version={version(1, 1, 'active')}
      items={[modelPrice()]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReview={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  expect(
    screen.queryByRole('button', { name: 'Delete' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText('Published versions are read-only')
  ).toBeInTheDocument()
})

test('repeats the review reason in the decision dialog', () => {
  render(
    <ReviewItemDialog
      itemId={1}
      action='accept'
      reason='Below minimum margin'
      detail='Generated margin: 1%; minimum margin: 2%'
      pending={false}
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  )

  expect(screen.getByText('Review reason')).toBeInTheDocument()
  expect(screen.getByText('Below minimum margin')).toBeInTheDocument()
  expect(
    screen.getByText('Generated margin: 1%; minimum margin: 2%')
  ).toBeInTheDocument()
})
