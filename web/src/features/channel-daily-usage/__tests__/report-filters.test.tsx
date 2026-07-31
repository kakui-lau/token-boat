// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ChannelDailyUsagePage } from '../index'

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
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
  useMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useQuery: (options: { queryKey: unknown[] }) => {
    const queryName = options.queryKey[0]
    if (queryName === 'channel-daily-usage-filter-options') {
      return {
        data: {
          data: {
            channels: [{ channel_id: 7, channel_name: 'Primary Channel' }],
            model_names: ['openai/gpt-test'],
            upstream_models: ['vendor/gpt-test'],
          },
        },
      }
    }
    if (queryName === 'channel-daily-usages') {
      return { data: { data: { items: [], total: 0 } }, isLoading: false }
    }
    if (queryName === 'channel-daily-usages-summary') {
      return {
        data: {
          data: {
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
        },
      }
    }
    return {
      data: {
        data: {
          month: '2026-06',
          timezone: 'UTC',
          status: 'open',
          locked_at: 0,
          locked_by: 0,
        },
      },
    }
  },
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: () => null,
}))

describe('Channel daily usage report filters', () => {
  afterEach(cleanup)

  test('offers channels and model names as report filter choices', () => {
    render(<ChannelDailyUsagePage />)

    expect(screen.getAllByText('Billed Amount')).toHaveLength(2)
    expect(screen.queryByText('User Revenue')).not.toBeInTheDocument()
    expect(
      screen.getByText('Report filters').closest('[data-slot="card"]')
    ).toHaveClass('overflow-visible')
    expect(screen.getByText('Total')).toBeVisible()

    const channel = screen.getByRole('combobox', { name: 'Channel' })
    fireEvent.focus(channel)
    expect(
      screen.getByRole('option', { name: /Primary Channel/ })
    ).toBeVisible()
    fireEvent.keyDown(channel, { key: 'Escape' })

    const platformModel = screen.getByRole('combobox', {
      name: 'Platform Model',
    })
    fireEvent.focus(platformModel)
    expect(
      screen.getByRole('option', { name: 'openai/gpt-test' })
    ).toBeVisible()
    fireEvent.keyDown(platformModel, { key: 'Escape' })

    const upstreamModel = screen.getByRole('combobox', {
      name: 'Upstream Model',
    })
    fireEvent.focus(upstreamModel)
    expect(
      screen.getByRole('option', { name: 'vendor/gpt-test' })
    ).toBeVisible()
  })

  test('switches the report to monthly aggregation with month filters', () => {
    render(<ChannelDailyUsagePage />)

    const aggregation = screen.getByRole('combobox', { name: 'Aggregation' })
    fireEvent.click(aggregation)
    const monthly = screen.getByRole('option', { name: 'Monthly' })
    fireEvent.pointerDown(monthly, { button: 0 })
    fireEvent.pointerUp(monthly, { button: 0 })
    fireEvent.click(monthly)

    expect(screen.getByText('UTC Month', { selector: 'th' })).toBeVisible()
    expect(screen.getByLabelText('Start Month')).toHaveAttribute(
      'type',
      'month'
    )
    expect(screen.getByLabelText('End Month')).toHaveAttribute('type', 'month')
    expect(screen.getByText('No monthly usage data found')).toBeVisible()
  })
})
