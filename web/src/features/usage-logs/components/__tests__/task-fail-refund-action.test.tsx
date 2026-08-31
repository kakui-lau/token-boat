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
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { manuallyFailAndRefundTask } from '../../api'
import { canManuallyFailAndRefund } from '../../lib/task-refund'
import type { TaskLog } from '../../types'
import { TaskFailRefundAction } from '../task-fail-refund-action'

vi.mock('../../api', () => ({
  manuallyFailAndRefundTask: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      Object.entries(values || {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, value),
        key
      ),
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('TaskFailRefundAction', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('only allows non-terminal tasks to be manually failed and refunded', () => {
    expect(canManuallyFailAndRefund(taskLog('QUEUED'))).toBe(true)
    expect(canManuallyFailAndRefund(taskLog('IN_PROGRESS'))).toBe(true)
    expect(canManuallyFailAndRefund(taskLog('SUCCESS'))).toBe(false)
    expect(canManuallyFailAndRefund(taskLog('FAILURE'))).toBe(false)
  })

  test('requires confirmation before sending the refund request', async () => {
    vi.mocked(manuallyFailAndRefundTask).mockResolvedValue({
      task_id: 'task_pending',
      refunded_quota: 500000,
      already_refunded: false,
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <TaskFailRefundAction log={taskLog('QUEUED')} />
      </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fail and refund' }))
    expect(screen.getByText('Mark task as failed and refund?')).toBeVisible()
    expect(manuallyFailAndRefundTask).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm failure and refund' })
    )
    await waitFor(() =>
      expect(manuallyFailAndRefundTask).toHaveBeenCalledWith('task_pending')
    )
  })
})

function taskLog(status: string): TaskLog {
  return {
    id: 1,
    user_id: 15,
    platform: '61',
    task_id: 'task_pending',
    action: 'generate',
    channel_id: 12,
    submit_time: 1,
    status,
    admin_billing: { quota: 500000 },
  }
}
