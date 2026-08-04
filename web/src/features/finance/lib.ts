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
