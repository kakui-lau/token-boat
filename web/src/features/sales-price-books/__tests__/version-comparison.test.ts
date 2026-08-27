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

import { getSalesPriceBookComparisonBase } from '../lib/version-comparison'
import type { SalesPriceBookVersion } from '../types'

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
    cost_basis_strategy: 'min_eligible_cost',
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

test('compares a draft with the current active version instead of the previous version number', () => {
  const active = version(1, 1, 'active')
  const hiddenHistory = version(6, 6, 'superseded')
  const draft = version(7, 7, 'draft')

  expect(
    getSalesPriceBookComparisonBase(
      [draft, hiddenHistory, active],
      draft,
      active.id
    )
  ).toBe(active)
})

test('does not compare the current active version with a historical version', () => {
  const active = version(1, 1, 'active')
  const history = version(6, 6, 'superseded')

  expect(
    getSalesPriceBookComparisonBase([history, active], active, active.id)
  ).toBeUndefined()
})
