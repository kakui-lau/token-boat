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

import { PurchasePricePanel } from '../components/purchase-price-panel'
import type { OfficialPriceVersion } from '../types'

const apiMocks = vi.hoisted(() => ({
  createPurchaseDraft: vi.fn(),
  updatePurchaseDraft: vi.fn(),
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

const officialVersion: OfficialPriceVersion = {
  id: 4,
  model_id: 1,
  billing_mode: 'token',
  price_structure: 'flat',
  price_components:
    '{"input_unit_price":"2.5","output_unit_price":"10","price_unit":"per_1m_tokens"}',
  billing_expr: 'v1:tier("flat", p * 2.5 + c * 10)',
  currency: 'USD',
  version: 2,
  status: 'active',
  source: 'manual',
  remark: '',
  effective_from: 1,
  effective_to: 0,
}

describe('purchase discount input', () => {
  test('accepts Chinese discount tenths and submits the stored multiplier', async () => {
    apiMocks.createPurchaseDraft.mockResolvedValue({
      success: true,
      data: {},
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <PurchasePricePanel
          channelModelId={31}
          officialVersions={[officialVersion]}
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

    expect(screen.getByText('Discount tenths unit')).toBeVisible()
    expect(
      screen.getByText('Enter 7 for 70% of the official price.')
    ).toBeVisible()

    fireEvent.change(screen.getByLabelText('Official Version'), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText('Purchase Discount'), {
      target: { value: '7' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }))

    await waitFor(() =>
      expect(apiMocks.createPurchaseDraft).toHaveBeenCalledWith({
        channel_model_id: 31,
        official_price_version_id: 4,
        pricing_mode: 'official_ratio',
        currency: 'USD',
        purchase_discount: '0.7',
        input_discount: '',
        output_discount: '',
        cache_read_discount: '',
        cache_write_discount: '',
        image_input_discount: '',
        image_output_discount: '',
        audio_input_discount: '',
        audio_output_discount: '',
        prices: {
          input_unit_price: '',
          output_unit_price: '',
          cache_read_unit_price: '',
          cache_write_unit_price: '',
          image_input_unit_price: '',
          image_output_unit_price: '',
          audio_input_unit_price: '',
          audio_output_unit_price: '',
        },
        quote_reference: '',
        contract_reference: '',
        remark: '',
        expected_updated_at: undefined,
      })
    )
  })
})
