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
import type { PurchasePriceVersion } from '../types'

const apiMocks = vi.hoisted(() => ({
  createRetailDraft: vi.fn(),
  updateRetailDraft: vi.fn(),
}))

vi.mock('../api', () => apiMocks)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const purchaseVersion: PurchasePriceVersion = {
  id: 7,
  channel_model_id: 31,
  official_price_version_id: 4,
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
})
