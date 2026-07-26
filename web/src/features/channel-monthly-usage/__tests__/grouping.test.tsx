// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ChannelMonthlyUsagePage } from '../index'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined
        ? key
        : key.replace('{{count}}', String(options.count)),
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) => {
    if (options.queryKey[0] === 'channel-monthly-usage-channels') {
      return {
        data: {
          data: {
            channels: [{ channel_id: 7, channel_name: 'Primary Channel' }],
          },
        },
      }
    }
    return {
      isLoading: false,
      data: {
        data: {
          items: [],
          total: 0,
          summary: {
            billed_request_count: 12,
            prompt_tokens: 120,
            cache_read_tokens: 20,
            cache_write_tokens: 0,
            completion_tokens: 40,
            total_tokens: 180,
            customer_quota: 0,
            customer_revenue_usd: '1.25',
            provider_reported_cost_usd: '0.5',
            provider_cost_known_count: 10,
            missing_usage_count: 1,
            pending_task_count: 1,
            manual_review_count: 0,
          },
          month: '2026-06',
          group_by: 'upstream_model',
        },
      },
    }
  },
}))

describe('Channel monthly usage grouping', () => {
  afterEach(cleanup)

  test('switches the grouped model column from upstream to platform', () => {
    render(<ChannelMonthlyUsagePage />)

    expect(
      screen.getByText('Report filters').closest('[data-slot="card"]')
    ).toHaveClass('overflow-visible')
    expect(
      screen.getByRole('columnheader', { name: 'Upstream Model' })
    ).toBeVisible()
    expect(screen.getByText('Total')).toBeVisible()
    expect(screen.getByText('10 / 12')).toBeVisible()

    const groupBy = screen.getByRole('combobox', { name: 'Group By' })
    fireEvent.click(groupBy)
    const platformModel = screen.getByRole('option', {
      name: 'Platform Model',
    })
    fireEvent.pointerDown(platformModel, { button: 0 })
    fireEvent.pointerUp(platformModel, { button: 0 })
    fireEvent.click(platformModel)

    expect(
      screen.getByRole('columnheader', { name: 'Platform Model' })
    ).toBeVisible()
  })
})
