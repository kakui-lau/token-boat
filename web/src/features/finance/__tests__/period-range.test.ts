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

import { getFinancePeriodRange } from '../lib'

describe('getFinancePeriodRange', () => {
  test('returns an exact seven-day UTC-second window', () => {
    const range = getFinancePeriodRange('7d', 2_000_000_000_000)

    expect(range.end_time).toBe(2_000_000_000)
    expect(range.start_time).toBe(2_000_000_000 - 7 * 24 * 60 * 60)
  })

  test('uses zero as the unbounded all-time start', () => {
    expect(getFinancePeriodRange('all', 2_000_000_000_000)).toEqual({
      start_time: 0,
      end_time: 2_000_000_000,
    })
  })
})
