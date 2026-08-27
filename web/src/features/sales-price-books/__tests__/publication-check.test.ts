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
import { expect, test } from 'vitest'

import { getSalesPriceBookPublicationIssue } from '../lib/publication-check'
import type { SalesPriceBookItem } from '../types'

function item(status: SalesPriceBookItem['status']): SalesPriceBookItem {
  return {
    id: 1,
    price_book_version_id: 2,
    model_id: 3,
    model_name: 'openai/test-model',
    status,
    billing_mode: 'token',
    price_structure: 'flat',
    price_components: '{}',
    sales_billing_expr: 'v2:p / 1000000',
    sales_expr_hash: '',
    expression_source: 'generated',
    expression_schema_version: 'v2',
    pricing_method: 'cost_plus',
    selling_factor: '1.2',
    official_discount: '0',
    minimum_margin_override: '0',
    currency: 'USD',
    remark: '',
  }
}

test('blocks publishing an empty sales price book version', () => {
  expect(getSalesPriceBookPublicationIssue([])).toEqual({ type: 'empty' })
})

test('returns every pending review before publication', () => {
  const reviewItem = item('review_required')
  expect(
    getSalesPriceBookPublicationIssue([item('enabled'), reviewItem])
  ).toEqual({ type: 'review', items: [reviewItem] })
})

test('allows a populated version without pending reviews', () => {
  expect(getSalesPriceBookPublicationIssue([item('enabled')])).toBeUndefined()
})
