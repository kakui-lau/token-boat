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

import {
  discountTenthsToStoredMultiplier,
  formatStoredRatePercentage,
  percentageToStoredRate,
  storedMultiplierToDiscountTenths,
  storedRateToPercentage,
} from '../lib/rate-format'

describe('pricing rate format', () => {
  test.each([
    ['0', '0'],
    ['0.001', '0.1'],
    ['0.11', '11'],
    ['0.165', '16.5'],
    ['0.999999', '99.9999'],
  ])('converts stored rate %s to percentage %s', (rate, percentage) => {
    expect(storedRateToPercentage(rate)).toBe(percentage)
  })

  test.each([
    ['0', '0'],
    ['0.1', '0.001'],
    ['11', '0.11'],
    ['16.5', '0.165'],
    ['99.9999', '0.999999'],
  ])('converts percentage %s to stored rate %s', (percentage, rate) => {
    expect(percentageToStoredRate(percentage)).toBe(rate)
  })

  test('formats a stored rate for administrator-facing display', () => {
    expect(formatStoredRatePercentage('0.165')).toBe('16.5%')
    expect(formatStoredRatePercentage('')).toBe('—')
  })

  test('converts between purchase discount tenths and stored multipliers', () => {
    expect(discountTenthsToStoredMultiplier('7')).toBe('0.7')
    expect(discountTenthsToStoredMultiplier('6.5')).toBe('0.65')
    expect(storedMultiplierToDiscountTenths('0.7')).toBe('7')
    expect(storedMultiplierToDiscountTenths('0.65')).toBe('6.5')
  })
})
