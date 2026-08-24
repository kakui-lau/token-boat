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

import { SORT_OPTIONS } from '../../constants'
import type { PricingModel, PublicPriceSummary } from '../../types'
import { filterAndSortModels, sortModels } from '../filters'
import {
  getAvailableGroups,
  getDisplayedSalesPrice,
  isModelAvailableForGroup,
} from '../model-helpers'

const defaultSummary: PublicPriceSummary = {
  currency: 'USD',
  billing_mode: 'token',
  price_structure: 'flat',
  items: [],
}

const vipSummary: PublicPriceSummary = {
  ...defaultSummary,
  items: [
    {
      key: 'input',
      component: 'token_input',
      amount: '2.4',
      unit: 'token',
      unit_size: '1000000',
    },
  ],
}

const model: PricingModel = {
  model_name: 'priced-model',
  enable_groups: ['default', 'vip'],
  available: true,
  availability_status: 'available',
  lowest_price: defaultSummary,
  sales_prices_by_group: { default: defaultSummary, vip: vipSummary },
}

describe('group-scoped sales price', () => {
  test('uses the selected group instead of the cross-group minimum', () => {
    expect(getDisplayedSalesPrice(model, 'vip')).toBe(vipSummary)
  })

  test('does not fall back to another group when selected group has no price', () => {
    expect(getDisplayedSalesPrice(model, 'unpriced')).toBeUndefined()
  })

  test('uses the cross-group component minimum when no group is selected', () => {
    expect(getDisplayedSalesPrice(model, 'all')).toBe(defaultSummary)
  })

  test('marks a selected group unavailable when it has no sales price', () => {
    expect(isModelAvailableForGroup(model, 'unpriced')).toBe(false)
  })

  test('uses priced groups for expression-only models', () => {
    const expressionOnlyModel: PricingModel = {
      ...model,
      lowest_price: undefined,
      sales_prices_by_group: undefined,
      pricing_source: 'sales_price_book',
      pricing_groups: ['vip'],
    }

    expect(isModelAvailableForGroup(expressionOnlyModel, 'vip')).toBe(true)
    expect(isModelAvailableForGroup(expressionOnlyModel, 'default')).toBe(false)
  })

  test('sorts by the selected group price and keeps unavailable models last', () => {
    const cheaperVipModel: PricingModel = {
      ...model,
      model_name: 'cheaper-vip-model',
      sales_prices_by_group: {
        vip: {
          ...vipSummary,
          items: [{ ...vipSummary.items[0], amount: '1.2' }],
        },
      },
    }
    const unavailableVipModel: PricingModel = {
      ...model,
      model_name: 'unavailable-vip-model',
      sales_prices_by_group: {},
    }
    const quoteRequiredVipModel: PricingModel = {
      ...model,
      model_name: 'quote-required-vip-model',
      lowest_price: undefined,
      sales_prices_by_group: undefined,
      pricing_source: 'sales_price_book',
      pricing_groups: ['vip'],
    }

    expect(
      sortModels(
        [model, unavailableVipModel, quoteRequiredVipModel, cheaperVipModel],
        SORT_OPTIONS.PRICE_LOW,
        'vip'
      ).map((item) => item.model_name)
    ).toEqual([
      'cheaper-vip-model',
      'priced-model',
      'quote-required-vip-model',
      'unavailable-vip-model',
    ])
  })

  test('applies the vendor filter in the combined filter pipeline', () => {
    const otherVendorModel: PricingModel = {
      ...model,
      model_name: 'other-vendor-model',
      vendor_name: 'Other',
    }
    const selectedVendorModel: PricingModel = {
      ...model,
      vendor_name: 'Selected',
    }

    expect(
      filterAndSortModels([otherVendorModel, selectedVendorModel], {
        search: '',
        vendor: 'Selected',
        group: 'all',
        quotaType: 'all',
        endpointType: 'all',
        tag: 'all',
        sortBy: SORT_OPTIONS.NAME,
      }).map((item) => item.model_name)
    ).toEqual(['priced-model'])
  })

  test('expands an all-groups route to every usable concrete group', () => {
    expect(
      getAvailableGroups(
        { ...model, enable_groups: ['all'] },
        { default: 'Default', vip: 'VIP', auto: 'Auto' }
      )
    ).toEqual(['default', 'vip'])
  })
})
