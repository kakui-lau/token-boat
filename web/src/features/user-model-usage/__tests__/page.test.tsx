/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
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

import { getUserModelUsage } from '../api'
import { UserModelUsagePage } from '../index'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      key === '{{count}} records' ? `${values?.count ?? 0} records` : key,
  }),
}))

vi.mock('../api', () => ({ getUserModelUsage: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('user model usage page', () => {
  test('shows aggregated usage and applies user and model filters', async () => {
    vi.mocked(getUserModelUsage).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            username: 'alice',
            user_id: 7,
            model_name: 'gpt-test',
            request_count: 12,
            prompt_tokens: 200,
            completion_tokens: 100,
            total_tokens: 300,
            quota: 500000,
            average_use_time: 1250,
          },
        ],
        total: 1,
        page: 1,
        page_size: 50,
        summary: {
          user_count: 1,
          model_count: 1,
          request_count: 12,
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          quota: 500000,
        },
      },
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <UserModelUsagePage />
      </QueryClientProvider>
    )

    expect(await screen.findByText('gpt-test')).toBeVisible()
    expect(screen.getByText('alice')).toBeVisible()
    expect(screen.getAllByText('12')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'alice' },
    })
    fireEvent.change(screen.getByLabelText('Model Name'), {
      target: { value: 'gpt-test' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(getUserModelUsage).toHaveBeenLastCalledWith(
        expect.objectContaining({ username: 'alice', model_name: 'gpt-test' })
      )
    })
  })
})
