/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  getDefaultUtcWeekRange,
  getUtcDate,
  getUtcMonthRange,
} from '../lib/date-range'

describe('UTC usage date ranges', () => {
  it('derives dates from UTC instead of the browser timezone', () => {
    const now = new Date('2026-07-26T00:30:00.000Z')
    expect(getUtcDate(-1, now)).toBe('2026-07-25')
  })

  it('returns the inclusive UTC month range expected by the API', () => {
    expect(getUtcMonthRange('2026-12-15')).toEqual({
      start_date: '2026-12-01',
      end_date: '2026-12-31',
    })
  })

  it('defaults to Monday through today during the UTC week', () => {
    expect(
      getDefaultUtcWeekRange(new Date('2026-07-23T18:30:00.000Z'))
    ).toEqual({
      start_date: '2026-07-20',
      end_date: '2026-07-23',
    })
  })

  it('defaults to today on Monday', () => {
    expect(
      getDefaultUtcWeekRange(new Date('2026-07-27T00:30:00.000Z'))
    ).toEqual({
      start_date: '2026-07-27',
      end_date: '2026-07-27',
    })
  })

  it('uses UTC weekday boundaries near a local-time date change', () => {
    expect(
      getDefaultUtcWeekRange(new Date('2026-07-26T23:30:00.000Z'))
    ).toEqual({
      start_date: '2026-07-20',
      end_date: '2026-07-26',
    })
  })
})
