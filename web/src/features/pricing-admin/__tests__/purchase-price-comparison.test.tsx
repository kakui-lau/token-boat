/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PurchasePriceComparison } from '../components/purchase-price-comparison'
import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(cleanup)

const officialVersion: OfficialPriceVersion = {
  id: 9,
  model_id: 1,
  billing_mode: 'token',
  price_structure: 'flat',
  price_components:
    '{"input_unit_price":"10","output_unit_price":"20","price_unit":"per_1m_tokens"}',
  billing_expr: 'v1:tier("flat", p * 10 + c * 20)',
  currency: 'USD',
  version: 3,
  status: 'active',
  source: 'manual',
  remark: '',
  effective_from: 1,
  effective_to: 0,
}

function purchaseVersion(
  overrides: Partial<PurchasePriceVersion>
): PurchasePriceVersion {
  return {
    id: 21,
    channel_model_id: 31,
    official_price_version_id: 9,
    pricing_mode: 'component_ratio',
    billing_mode: 'token',
    price_structure: 'flat',
    price_components:
      '{"input_unit_price":"6","output_unit_price":"16","price_unit":"per_1m_tokens"}',
    quote_spec: '{"input_discount":"0.6","output_discount":"0.8"}',
    input_unit_price: '6',
    output_unit_price: '16',
    cache_read_unit_price: '',
    cache_write_unit_price: '',
    currency: 'USD',
    version: 2,
    status: 'draft',
    purchase_discount: '',
    purchase_billing_expr: 'v1:tier("flat", p * 6 + c * 16)',
    expression_source: 'generated',
    expression_schema_version: 'v1',
    price_unit: 'per_1m_tokens',
    quote_reference: '',
    contract_reference: '',
    conditions: '',
    remark: '',
    effective_from: 0,
    effective_to: 0,
    ...overrides,
  }
}

describe('purchase price comparison', () => {
  test('shows component-specific discounts between official and purchase prices', () => {
    render(
      <PurchasePriceComparison
        purchase={purchaseVersion({})}
        officialVersion={officialVersion}
      />
    )

    expect(screen.getByText('10 USD')).toBeVisible()
    expect(screen.getByText('6 USD')).toBeVisible()
    expect(screen.getByText('60%')).toBeVisible()
    expect(screen.getByText('20 USD')).toBeVisible()
    expect(screen.getByText('16 USD')).toBeVisible()
    expect(screen.getByText('80%')).toBeVisible()
  })

  test('identifies a fixed net price without inventing an official discount', () => {
    render(
      <PurchasePriceComparison
        purchase={purchaseVersion({
          official_price_version_id: undefined,
          pricing_mode: 'fixed_unit_price',
          price_components:
            '{"input_unit_price":"3","price_unit":"per_1m_tokens"}',
          input_unit_price: '3',
          output_unit_price: '',
          quote_spec: '',
        })}
      />
    )

    expect(screen.getByText('3 USD')).toBeVisible()
    expect(screen.getByText('Fixed Prices')).toBeVisible()
    expect(
      screen.queryByText('Official price unavailable')
    ).not.toBeInTheDocument()
  })
})
