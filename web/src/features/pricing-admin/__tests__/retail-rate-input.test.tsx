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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { RetailPricePanel } from '../components/retail-price-panel'
import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'

const apiMocks = vi.hoisted(() => ({
  createRetailDraft: vi.fn(),
  updateRetailDraft: vi.fn(),
}))

vi.mock('../api', () => apiMocks)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      Object.entries(values || {}).reduce(
        (result, [name, value]) =>
          result.replaceAll(`{{${name}}}`, String(value)),
        key
      ),
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const purchaseVersion: PurchasePriceVersion = {
  id: 7,
  channel_model_id: 31,
  official_price_version_id: undefined,
  pricing_mode: 'official_ratio',
  billing_mode: 'token',
  price_structure: 'flat',
  price_components: '{}',
  input_unit_price: '10',
  output_unit_price: '20',
  cache_read_unit_price: '',
  cache_write_unit_price: '',
  currency: 'USD',
  version: 1,
  status: 'active',
  purchase_discount: '0.65',
  purchase_billing_expr: 'v1:tier("flat", p * 10 + c * 20)',
  expression_source: 'generated',
  expression_schema_version: 'v1',
  price_unit: 'per_1m_tokens',
  quote_reference: '',
  contract_reference: '',
  conditions: '',
  remark: '',
  effective_from: 1,
  effective_to: 0,
}

const officialVersion: OfficialPriceVersion = {
  id: 4,
  model_id: 9,
  billing_mode: 'video_duration',
  price_structure: 'expression',
  price_components: JSON.stringify({
    rules: [
      {
        name: '480p',
        component: 'video_output',
        unit: 'second',
        unit_size: '1',
        unit_price: '0.04',
      },
    ],
  }),
  billing_expr: 'v2:tier("480p", video_s * 0.04)',
  expression_source: 'generated',
  expression_schema_version: 'v2',
  currency: 'USD',
  source: 'vendor-official',
  source_version: 'test',
  version: 1,
  status: 'active',
  effective_from: 1,
  effective_to: 0,
  remark: '',
}

const videoPurchaseVersion: PurchasePriceVersion = {
  ...purchaseVersion,
  id: 8,
  official_price_version_id: 4,
  billing_mode: 'video_duration',
  price_structure: 'expression',
  price_components: JSON.stringify({
    rules: [
      {
        name: '480p',
        component: 'video_output',
        unit: 'second',
        unit_size: '1',
        unit_price: '0.024',
      },
    ],
  }),
  input_unit_price: '',
  output_unit_price: '',
  purchase_billing_expr: 'v2:tier("480p", video_s * 0.024)',
  expression_schema_version: 'v2',
}

const multimodalPurchaseVersion: PurchasePriceVersion = {
  ...purchaseVersion,
  id: 9,
  price_components: JSON.stringify({
    input_unit_price: '5',
    output_unit_price: '10',
    image_input_unit_price: '8',
    image_output_unit_price: '30',
    audio_input_unit_price: '4',
    audio_output_unit_price: '12',
  }),
  input_unit_price: '5',
  output_unit_price: '10',
}

describe('retail percentage inputs', () => {
  test('shows percentages and submits decimal rates to the API', async () => {
    apiMocks.createRetailDraft.mockResolvedValue({
      success: true,
      data: {},
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[]}
          purchaseVersions={[purchaseVersion]}
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

    expect(screen.getAllByText('%')).toHaveLength(4)
    expect(screen.getByLabelText('Target Margin (TM)')).toHaveValue(10)
    expect(
      screen.getByText(
        'Enter rates as percentages; for example, enter 16.5 for 16.5%.'
      )
    ).toBeVisible()

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText('Variable Cost Rate (VCR)'), {
      target: { value: '11' },
    })
    fireEvent.change(screen.getByLabelText('Tax Rate (TR)'), {
      target: { value: '16.5' },
    })
    fireEvent.change(screen.getByLabelText('Target Margin (TM)'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Margin Floor'), {
      target: { value: '10' },
    })
    expect(
      screen.getByText(
        'Used only for price simulation and margin alerts; it does not affect retail price generation.'
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() =>
      expect(apiMocks.createRetailDraft).toHaveBeenCalledWith({
        channel_model_id: 31,
        purchase_price_version_id: 7,
        total_variable_cost_rate: '0.11',
        effective_tax_rate: '0.165',
        target_net_margin: '0.2',
        minimum_margin_rate: '0.1',
        remark: '',
        expected_updated_at: undefined,
      })
    )
  })

  test('blocks saving when a generated retail component equals the official price', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[officialVersion]}
          purchaseVersions={[videoPurchaseVersion]}
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

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '8' },
    })
    fireEvent.change(screen.getByLabelText('Target Margin (TM)'), {
      target: { value: '40' },
    })

    expect(
      screen.getByRole('alert', {
        name: 'Retail price must be lower than the official price.',
      })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))
    expect(apiMocks.createRetailDraft).not.toHaveBeenCalled()
  })

  test('blocks saving when the referenced official price is unavailable', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[]}
          purchaseVersions={[videoPurchaseVersion]}
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

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '8' },
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Official price unavailable'
    )
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
  })

  test('blocks saving when the selling factor exceeds the supported maximum', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[]}
          purchaseVersions={[purchaseVersion]}
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

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '7' },
    })
    fireEvent.change(screen.getByLabelText('Target Margin (TM)'), {
      target: { value: '99.99999' },
    })

    expect(
      screen.getByText('Selling factor exceeds the supported maximum.')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled()
  })

  test('previews rule-based video retail prices instead of empty token fields', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[officialVersion]}
          purchaseVersions={[videoPurchaseVersion]}
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

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '8' },
    })

    expect(screen.getByText('Selling Factor: 1.12')).toHaveClass(
      'text-emerald-600'
    )
    expect(
      screen.getByText(/Purchase Discount: 6\.5\/10/)
    ).toBeVisible()
    expect(screen.getByText('Retail Markup: 11.11%')).toBeVisible()
    expect(screen.getByText('Below official price')).toBeVisible()
    expect(screen.getByText('480p')).toBeVisible()
    expect(
      screen.getByText('Official Price: 0.04 USD / 1 second')
    ).toBeVisible()
    expect(
      screen.getByText('Purchase Price: 0.024 USD / 1 second')
    ).toBeVisible()
    expect(
      screen.getByText('Retail Price: 0.02667 USD / 1 second')
    ).toBeVisible()
    expect(screen.queryByText('Input: — USD')).not.toBeInTheDocument()
  })

  test('previews every populated multimodal price component', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <RetailPricePanel
          channelModelId={31}
          officialVersions={[]}
          purchaseVersions={[multimodalPurchaseVersion]}
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

    fireEvent.change(screen.getByLabelText('Purchase Version'), {
      target: { value: '9' },
    })

    expect(screen.getByText('Image Input / 1M tokens')).toBeVisible()
    expect(screen.getByText('Purchase Price: 8 USD')).toBeVisible()
    expect(screen.getByText('Retail Price: 8.88889 USD')).toBeVisible()
    expect(screen.getByText('Image Output / 1M tokens')).toBeVisible()
    expect(screen.getByText('Retail Price: 33.33334 USD')).toBeVisible()
    expect(screen.getByText('Audio Input / 1M tokens')).toBeVisible()
    expect(screen.getByText('Retail Price: 4.44445 USD')).toBeVisible()
    expect(screen.getByText('Audio Output / 1M tokens')).toBeVisible()
    expect(screen.getByText('Retail Price: 13.33334 USD')).toBeVisible()
  })
})
