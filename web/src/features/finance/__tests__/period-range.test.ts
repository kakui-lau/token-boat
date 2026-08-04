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
