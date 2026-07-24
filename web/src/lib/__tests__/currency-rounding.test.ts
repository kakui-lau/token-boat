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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { truncateToFractionDigits } from '../currency'

describe('billing currency truncation', () => {
  test('discards positive fractional digits without rounding up', () => {
    assert.equal(truncateToFractionDigits(0.0000259, 6), 0.000025)
  })

  test('discards negative fractional digits toward zero', () => {
    assert.equal(truncateToFractionDigits(-0.0000059, 6), -0.000005)
  })

  test('does not expose binary drift as a lower configured price', () => {
    const computedOutputPrice = 0.09 * 2.222222222222222
    assert.equal(truncateToFractionDigits(computedOutputPrice, 6), 0.2)
  })
})
