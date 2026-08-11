/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, test } from 'vitest'

import type { TaskLog } from '../../../types'
import { getTaskBillingDisplayState } from '../task-logs-columns'

describe('task billing display state', () => {
  test('marks a zero-cost task without billing workflow as not applicable', () => {
    const state = getTaskBillingDisplayState(
      taskLog({ quota: 0, settlement_status: '', billing_audit_status: '' })
    )

    expect(state.notApplicable).toBe(true)
  })

  test('keeps an explicit pending settlement visible', () => {
    const state = getTaskBillingDisplayState(
      taskLog({ quota: 500000, settlement_status: 'pending' })
    )

    expect(state.notApplicable).toBe(false)
    expect(state.settlement).toBe('pending')
  })
})

function taskLog(adminBilling: TaskLog['admin_billing']): TaskLog {
  return {
    id: 1,
    user_id: 1,
    platform: '54',
    task_id: 'task_test',
    action: 'TEXT_GENERATE',
    channel_id: 15,
    submit_time: 1,
    status: 'FAILURE',
    admin_billing: adminBilling,
  }
}
