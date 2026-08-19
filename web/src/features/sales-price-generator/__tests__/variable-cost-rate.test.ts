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

import { calculateVariableCostPercentage } from '../lib/variable-cost-rate'

describe('variable cost rate calculation', () => {
  test.each([
    { components: ['4', '5', '2'], expected: '11' },
    { components: ['4.500', '5.25', '2.250'], expected: '12' },
    { components: ['0.1', '0.2', '0.3'], expected: '0.6' },
  ])('adds $components without floating-point drift', (fixture) => {
    expect(calculateVariableCostPercentage(fixture.components)).toBe(
      fixture.expected
    )
  })
})
