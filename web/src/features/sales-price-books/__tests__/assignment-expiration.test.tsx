// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { AssignUserDialog } from '../components/assign-user-dialog'
import type { SalesPriceBook } from '../types'

vi.mock('@/features/users/api', () => ({
  searchUsers: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

vi.mock('../api', () => ({
  assignUserPriceBook: vi.fn(),
  getSalesPriceBookVersions: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('defaults assignments to long-term and only asks for an end time when requested', () => {
  const book: SalesPriceBook = {
    id: 9,
    code: 'enterprise-long-term',
    name: 'Enterprise Long-term',
    audience: 'tob',
    currency: 'USD',
    status: 'enabled',
    model_count: 1,
    assigned_users: 0,
    missing_model_count: 0,
    remark: '',
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <AssignUserDialog open books={[book]} onOpenChange={vi.fn()} />
    </QueryClientProvider>
  )

  const longTerm = screen.getByRole('button', {
    name: 'Long-term (default)',
  })
  expect(longTerm).toHaveAttribute('aria-pressed', 'true')
  expect(
    screen.queryByLabelText('Effective to', { selector: 'input' })
  ).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Set end time' }))
  expect(
    screen.getByLabelText('Effective to', { selector: 'input' })
  ).toBeInTheDocument()

  fireEvent.click(longTerm)
  expect(
    screen.queryByLabelText('Effective to', { selector: 'input' })
  ).not.toBeInTheDocument()
})
