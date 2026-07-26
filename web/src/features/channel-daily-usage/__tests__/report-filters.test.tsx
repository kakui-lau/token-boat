// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
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
      return { data: { data: {} } }
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
})
