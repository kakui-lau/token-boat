// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ChannelPriceVersionDialog } from '../components/channel-price-version-dialog'
import { VersionList } from '../components/version-list'
import type { PurchasePriceVersion } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(cleanup)

describe('Pricing version lifecycle', () => {
  test('requires confirmation before publishing a draft', () => {
    const onPublish = vi.fn()
    render(
      <VersionList
        items={[
          {
            id: 12,
            version: 3,
            status: 'draft',
            currency: 'USD',
          },
        ]}
        isPublishing={false}
        isSuspending={false}
        isDeleting={false}
        onPublish={onPublish}
        onSuspend={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(onPublish).not.toHaveBeenCalled()
    expect(
      screen.getByRole('alertdialog', { name: 'Publish price version?' })
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Publish' }))
    expect(onPublish).toHaveBeenCalledWith(12)
  })

  test('shows dependency impact before suspending an active version', () => {
    const onSuspend = vi.fn()
    render(
      <VersionList
        items={[
          {
            id: 18,
            version: 5,
            status: 'active',
            currency: 'USD',
          },
        ]}
        isPublishing={false}
        isSuspending={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onSuspend={onSuspend}
        onDelete={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    expect(onSuspend).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'This active price will stop being available. Dependent version checks still apply.'
      )
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Suspend' }))
    expect(onSuspend).toHaveBeenCalledWith(18)
  })

  test('presents complete purchase snapshot details without exposing raw JSON', () => {
    const version: PurchasePriceVersion = {
      id: 7,
      channel_model_id: 2,
      official_price_version_id: 4,
      pricing_mode: 'official_ratio',
      billing_mode: 'token',
      price_structure: 'flat',
      price_components:
        '{"input_unit_price":"1.25","output_unit_price":"5.5","schema_version":"v1"}',
      input_unit_price: '1.25',
      output_unit_price: '5.5',
      cache_read_unit_price: '',
      cache_write_unit_price: '',
      currency: 'USD',
      version: 6,
      status: 'active',
      purchase_discount: '0.65',
      purchase_billing_expr: 'v1:tier("flat", p * 1.25 + c * 5.5)',
      expression_source: 'generated',
      expression_schema_version: 'v1',
      price_unit: 'million_tokens',
      quote_reference: 'AST-Q-2026',
      contract_reference: 'AST-C-2026',
      conditions: 'Annual commitment',
      remark: 'Enterprise quote',
      effective_from: 1,
      effective_to: 0,
    }

    render(
      <ChannelPriceVersionDialog
        kind='purchase'
        version={version}
        onOpenChange={vi.fn()}
      />
    )

    expect(
      screen.getByRole('dialog', { name: 'Purchase Version Details · v6' })
    ).toBeVisible()
    expect(screen.getByText('AST-Q-2026')).toBeVisible()
    expect(screen.getByText('0.65')).toBeVisible()
    expect(screen.getByText('1.25 USD')).toBeVisible()
    expect(screen.queryByText(version.price_components)).not.toBeInTheDocument()
  })
})
