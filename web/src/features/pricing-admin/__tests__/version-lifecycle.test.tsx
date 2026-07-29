// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ChannelPriceVersionDialog } from '../components/channel-price-version-dialog'
import { PurchasePricePanel } from '../components/purchase-price-panel'
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

  test('loads an unpublished purchase version into the edit form', () => {
    const version: PurchasePriceVersion = {
      id: 21,
      channel_model_id: 2,
      official_price_version_id: 4,
      pricing_mode: 'component_ratio',
      billing_mode: 'token',
      price_structure: 'flat',
      price_components:
        '{"input_unit_price":"1.2","output_unit_price":"6.4","price_unit":"per_1m_tokens"}',
      quote_spec: '{"input_discount":"0.6","output_discount":"0.8"}',
      input_unit_price: '1.2',
      output_unit_price: '6.4',
      cache_read_unit_price: '',
      cache_write_unit_price: '',
      currency: 'USD',
      version: 2,
      status: 'draft',
      purchase_discount: '',
      purchase_billing_expr: 'v1:tier("base", p * 1.2 + c * 6.4)',
      expression_source: 'generated',
      expression_schema_version: 'v1',
      price_unit: 'per_1m_tokens',
      quote_reference: 'Q-21',
      contract_reference: '',
      conditions: '',
      remark: 'pending approval',
      effective_from: 0,
      effective_to: 0,
    }
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PurchasePricePanel
          channelModelId={2}
          officialVersions={[
            {
              id: 4,
              model_id: 1,
              billing_mode: 'token',
              price_structure: 'flat',
              price_components: '{}',
              billing_expr: 'v1:tier("base", p * 2 + c * 8)',
              currency: 'USD',
              version: 1,
              status: 'active',
              source: 'manual',
              remark: '',
              effective_from: 1,
              effective_to: 0,
            },
          ]}
          versions={[version]}
          isPublishing={false}
          isSuspending={false}
          isDeleting={false}
          onPublish={vi.fn()}
          onSuspend={vi.fn()}
          onDelete={vi.fn()}
          onCreated={vi.fn().mockResolvedValue(undefined)}
        />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(
      screen.getByRole('heading', { name: 'Edit Purchase Version' })
    ).toBeVisible()
    expect(screen.getByLabelText('Input discount')).toHaveValue('0.6')
    expect(screen.getByLabelText('Output discount')).toHaveValue('0.8')
    expect(screen.getByLabelText('Quote ID')).toHaveValue('Q-21')
    expect(screen.getByRole('button', { name: 'Update Draft' })).toBeEnabled()
  })

  test('allows an active multimodal official price for a uniform purchase discount', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <PurchasePricePanel
          channelModelId={2}
          officialVersions={[
            {
              id: 9,
              model_id: 1,
              billing_mode: 'video_duration',
              price_structure: 'expression',
              price_components:
                '{"rules":[{"id":"default","name":"Default","component":"video_output","unit":"second","unit_size":"1","unit_price":"0.34"}]}',
              billing_expr: 'v2:tier("default", video_seconds * 0.34)',
              currency: 'USD',
              version: 4,
              status: 'active',
              source: 'manual',
              remark: '',
              effective_from: 1,
              effective_to: 0,
            },
          ]}
          versions={[]}
          isPublishing={false}
          isSuspending={false}
          isDeleting={false}
          onPublish={vi.fn()}
          onSuspend={vi.fn()}
          onDelete={vi.fn()}
          onCreated={vi.fn().mockResolvedValue(undefined)}
        />
      </QueryClientProvider>
    )

    const officialVersion = screen.getByLabelText('Official Version')
    expect(officialVersion).toHaveTextContent('Version 4 · active · expression')
    expect(
      screen.queryByText(
        'Publish a compatible active official price before creating a discount-based purchase version.'
      )
    ).not.toBeInTheDocument()
  })

  test('renders tier rules and request conditions in version details', () => {
    const version: PurchasePriceVersion = {
      id: 30,
      channel_model_id: 2,
      official_price_version_id: 5,
      pricing_mode: 'official_ratio',
      billing_mode: 'token',
      price_structure: 'tiered',
      price_components:
        '{"rules":[{"id":"short","name":"standard","component":"token_input","unit":"token","unit_size":"1000000","unit_price":"2","upper_bound":"100000"},{"id":"fallback","name":"default","component":"token_input","unit":"token","unit_size":"1000000","unit_price":"4"}]}',
      input_unit_price: '',
      output_unit_price: '',
      cache_read_unit_price: '',
      cache_write_unit_price: '',
      currency: 'USD',
      version: 3,
      status: 'draft',
      purchase_discount: '0.5',
      purchase_billing_expr:
        'v1:len <= 100000 ? tier("standard", p * 2) : tier("default", p * 4)',
      expression_source: 'generated',
      expression_schema_version: 'v1',
      price_unit: 'expression',
      quote_reference: '',
      contract_reference: '',
      conditions: '',
      remark: '',
      effective_from: 0,
      effective_to: 0,
    }

    render(
      <ChannelPriceVersionDialog
        kind='purchase'
        version={version}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText('standard')).toBeVisible()
    expect(screen.getByText('default')).toBeVisible()
    expect(screen.getAllByText('Token input')).toHaveLength(2)
    expect(screen.getByText('Usage upper bound: 100000')).toBeVisible()
    expect(screen.getByText('2 USD / 1000000 token')).toBeVisible()
  })
})
