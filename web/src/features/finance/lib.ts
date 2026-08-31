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
import type { FinancePeriod } from './types'

const PERIOD_DAYS: Record<Exclude<FinancePeriod, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

export function getFinancePeriodRange(
  period: FinancePeriod,
  nowMs = Date.now()
): { start_time: number; end_time: number } {
  const endTime = Math.floor(nowMs / 1000)
  if (period === 'all') {
    return { start_time: 0, end_time: endTime }
  }
  return {
    start_time: endTime - PERIOD_DAYS[period] * 24 * 60 * 60,
    end_time: endTime,
  }
}
