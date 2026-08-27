// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { getSalesPriceBookAuditRecords } from '../api'
import { PriceBookAuditPanel } from '../components/price-book-audit-panel'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let result = key
      for (const [name, value] of Object.entries(values ?? {})) {
        result = result.replace(`{{${name}}}`, String(value))
      }
      return result
    },
  }),
}))

vi.mock('../api', () => ({
  getSalesPriceBookAuditRecords: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('loads price book activity with 10 rows per page by default', async () => {
  vi.mocked(getSalesPriceBookAuditRecords).mockResolvedValue({
    success: true,
    data: { items: [], total: 0, page: 1, page_size: 10 },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PriceBookAuditPanel priceBookId={17} />
    </QueryClientProvider>
  )

  await waitFor(() => {
    expect(getSalesPriceBookAuditRecords).toHaveBeenCalledWith(17, 1, 10)
  })
  expect(
    await screen.findByRole('combobox', { name: 'Rows per page' })
  ).toHaveValue('10')
})
