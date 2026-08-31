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
    price_components: JSON.stringify({
      input_unit_price: '2.5',
      output_unit_price: '15',
      cache_read_unit_price: '0.25',
      cache_write_unit_price: '3.75',
    }),
    sales_billing_expr: 'v2:(p * 1.170568561872909700)',
    sales_expr_hash: '',
    expression_source: 'generated',
    expression_schema_version: 'v2',
    pricing_method: 'cost_plus',
    selling_factor: '1.170568561872909700',
    purchase_discount: '0.7',
    sales_discount: '0.819397993311036790',
    official_discount: '',
    currency: 'USD',
    channel_margins: [
      {
        channel_model_id: 11,
        channel_name: 'Primary Channel',
        purchase_price_version_id: 101,
        purchase_pricing_mode: 'official_ratio',
        purchase_discount: '0.7',
        sales_discount: '0.819397993311036790',
        source_role: 'cost_basis',
        reference_cost: '4.2',
        margin_rate: '0.03125',
        meets_minimum_margin: true,
        channel_model_override_id: 301,
        overridden_fields: ['payment_fee_rate', 'target_net_margin'],
        payment_fee_rate: '0',
        distribution_fee_rate: '0.05',
        operations_labor_rate: '0.02',
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.04',
        minimum_margin_rate: '0.02',
      },
      {
        channel_model_id: 12,
        channel_name: 'Backup Channel',
        purchase_price_version_id: 102,
        purchase_pricing_mode: 'official_ratio',
        purchase_discount: '0.8',
        sales_discount: '0.825',
        source_role: 'cost_basis',
        reference_cost: '4.8',
        margin_rate: '0.015',
        meets_minimum_margin: false,
        channel_model_override_id: 0,
        payment_fee_rate: '0.04',
        distribution_fee_rate: '0.05',
        operations_labor_rate: '0.02',
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.16',
        target_net_margin: '0.03',
        minimum_margin_rate: '0.02',
      },
    ],
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
      onRegenerate={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  expect(screen.getByText('Purchase cost × 1.1706')).toBeInTheDocument()
  expect(screen.getByText('Sales discount')).toBeInTheDocument()
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

test('shows an above-official warning without changing the enabled status', () => {
  render(
    <ModelPriceTable
      version={version(1, 1, 'active')}
      items={[
        {
          ...modelPrice(),
          sales_discount: '1.0390324354040682',
          warning_code: 'above_official_price',
          warning_sales_discount: '1.0390324354040682',
        },
      ]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReview={vi.fn()}
      onRegenerate={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(
    screen.getByText('Sales price is above official price')
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      'Sales discount: 10.3903/10; 3.9032% above official price.'
    )
  ).toBeInTheDocument()
  expect(screen.queryByText('Requires review')).not.toBeInTheDocument()
})

test('expands a logical model to show each channel cost and margin', () => {
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
      onRegenerate={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  const expandButton = screen.getByRole('button', {
    name: '2 channel costs',
  })
  expect(expandButton).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Primary Channel')).not.toBeInTheDocument()

  fireEvent.click(expandButton)

  const channelDetails = screen.getByRole('region', {
    name: 'Channel costs and margins for openai/gpt-test',
  })
  expect(expandButton).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Primary Channel')).toBeInTheDocument()
  expect(screen.getByText('Backup Channel')).toBeInTheDocument()
  expect(within(channelDetails).getByText('Sales discount')).toBeInTheDocument()
  expect(
    within(channelDetails).getByText('8.194/10 (81.9398% of official price)')
  ).toBeInTheDocument()
  expect(
    within(channelDetails).getByText('8.25/10 (82.5% of official price)')
  ).toBeInTheDocument()
  expect(
    screen.getByText('Price using the highest eligible channel cost')
  ).toBeInTheDocument()
  expect(screen.getByText('Margin allows routing')).toBeInTheDocument()
  expect(screen.getByText('Margin blocks routing')).toBeInTheDocument()
  expect(screen.getByText('Purchase Discount')).toBeInTheDocument()
  expect(screen.getByText('2 override')).toBeInTheDocument()
  expect(screen.getByText('Payment processing fee 4% → 0%')).toBeInTheDocument()
  expect(screen.getByText('Target margin 3% → 4%')).toBeInTheDocument()
  expect(screen.getByText('Version default')).toBeInTheDocument()
  expect(screen.queryByText('Sample sales amount')).not.toBeInTheDocument()
  expect(screen.queryByText('Sample purchase amount')).not.toBeInTheDocument()
  expect(screen.queryByText('Sample net margin')).not.toBeInTheDocument()
})

test('opens itemized sales price details from an expanded logical model', () => {
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
      onRegenerate={vi.fn()}
      onSetEnabled={vi.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: '2 channel costs' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'View sales price details' })
  )
  expect(
    screen.getByRole('dialog', {
      name: 'Sales price details for openai/gpt-test',
    })
  ).toBeInTheDocument()
  expect(screen.getByText('Input / 1M tokens')).toBeInTheDocument()
  expect(screen.getByText('USD 2.5')).toBeInTheDocument()
  expect(screen.getByText('Output / 1M tokens')).toBeInTheDocument()
  expect(screen.getByText('USD 15')).toBeInTheDocument()
  expect(screen.getByText('Cache Read / 1M tokens')).toBeInTheDocument()
  expect(screen.getByText('USD 0.25')).toBeInTheDocument()
  expect(screen.getByText('Cache Write / 1M tokens')).toBeInTheDocument()
  expect(screen.getByText('USD 3.75')).toBeInTheDocument()
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
      onRegenerate={vi.fn()}
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

test('requires regeneration instead of reviewing a stale policy price', () => {
  const onRegenerate = vi.fn()
  render(
    <ModelPriceTable
      version={version(2, 2, 'draft')}
      items={[
        {
          ...reviewModelPrice(),
          review_risk_code: 'channel_model_policy_changed',
        },
      ]}
      isLoading={false}
      canExport={false}
      isExporting={false}
      isDeleting={false}
      isUpdatingStatus={false}
      onExport={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onReview={vi.fn()}
      onRegenerate={onRegenerate}
      onSetEnabled={vi.fn()}
    />
  )

  expect(
    screen.getAllByText('Channel model special parameters changed')
  ).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  expect(onRegenerate).toHaveBeenCalledWith(
    expect.objectContaining({ id: reviewModelPrice().id })
  )
  expect(
    screen.queryByRole('button', { name: 'Accept risk' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Reject' })
  ).not.toBeInTheDocument()
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
      onRegenerate={vi.fn()}
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
      onRegenerate={vi.fn()}
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
