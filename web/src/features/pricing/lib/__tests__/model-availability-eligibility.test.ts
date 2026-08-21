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
import { describe, expect, test } from 'vitest'

import type { PricingModel } from '../../types'
import { isModelEligibleForAvailabilityMetrics } from '../model-helpers'

describe('model availability metrics eligibility', () => {
  test('keeps only enabled, routable, priced text LLMs', () => {
    expect(isModelEligibleForAvailabilityMetrics(pricedTextModel())).toBe(true)

    expect(
      isModelEligibleForAvailabilityMetrics(
        pricedTextModel({
          available: false,
          availability_status: 'route_unavailable',
        })
      )
    ).toBe(false)

    expect(
      isModelEligibleForAvailabilityMetrics(
        pricedTextModel({
          available: false,
          availability_status: 'price_unavailable',
          lowest_price: undefined,
          pricing_groups: undefined,
        })
      )
    ).toBe(false)

    expect(
      isModelEligibleForAvailabilityMetrics(
        pricedTextModel({ lowest_price: undefined })
      )
    ).toBe(false)

    expect(
      isModelEligibleForAvailabilityMetrics(
        pricedTextModel({
          model_name: 'bytedance/seedance-2.0-fast-upscale',
          quota_type: 1,
          supported_endpoint_types: ['openai-video'],
        })
      )
    ).toBe(false)
  })
})

function pricedTextModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    model_name: 'openai/gpt-5.4-nano',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    supported_endpoint_types: ['openai'],
    available: true,
    availability_status: 'available',
    pricing_groups: ['default'],
    lowest_price: {
      currency: 'USD',
      billing_mode: 'token',
      price_structure: 'flat',
      items: [
        {
          key: 'token_input|token|1000000||||||',
          component: 'token_input',
          amount: '1',
          unit: 'token',
          unit_size: '1000000',
        },
      ],
    },
    ...overrides,
  }
}
