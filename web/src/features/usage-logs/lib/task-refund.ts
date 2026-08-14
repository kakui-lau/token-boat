import type { TaskLog } from '../types'

const TERMINAL_TASK_STATUSES = new Set([
  'SUCCESS',
  'FAILURE',
  'CANCELLED',
  'EXPIRED',
])

export function canManuallyFailAndRefund(log: TaskLog): boolean {
  return !TERMINAL_TASK_STATUSES.has(log.status)
}
