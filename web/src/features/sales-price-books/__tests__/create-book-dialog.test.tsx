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
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { CreateBookDialog } from '../components/create-book-dialog'
import type { SalesPriceBook } from '../types'

const createSalesPriceBook = vi.fn()

vi.mock('../api', () => ({
  createSalesPriceBook: (...args: unknown[]) => createSalesPriceBook(...args),
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

test('continues to first-version setup after creating an empty price book', async () => {
  const createdBook: SalesPriceBook = {
    id: 9,
    code: 'enterprise-test',
    name: 'Enterprise Test',
    audience: 'tob',
    currency: 'USD',
    status: 'draft',
    model_count: 0,
    assigned_users: 0,
    missing_model_count: 40,
    remark: '',
  }
  createSalesPriceBook.mockResolvedValue({ data: createdBook })
  const onOpenChange = vi.fn()
  const onCreated = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <CreateBookDialog
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />
    </QueryClientProvider>
  )

  fireEvent.change(screen.getByLabelText('Price book code'), {
    target: { value: 'enterprise-test' },
  })
  fireEvent.change(screen.getByLabelText('Price book name'), {
    target: { value: 'Enterprise Test' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))

  await waitFor(() => {
    expect(onCreated).toHaveBeenCalledWith(createdBook)
  })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
