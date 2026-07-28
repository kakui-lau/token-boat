// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { OfficialPricing } from '..'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/features/pricing-admin/api', () => ({
  deletePriceDraft: vi.fn(),
  getOfficialPriceVersions: vi.fn().mockResolvedValue({ data: [] }),
  getPricingCatalogOptions: vi.fn().mockResolvedValue({
    data: {
      channels: [],
      models: [{ id: 7, name: 'openai/gpt-test' }],
    },
  }),
  importLegacyOfficialPrices: vi.fn(),
  publishPriceVersion: vi.fn(),
  suspendPriceVersion: vi.fn(),
}))

vi.mock('@/features/pricing-admin/components/official-price-panel', () => ({
  OfficialPricePanel: ({ modelId }: { modelId: number }) => (
    <div>Official price editor for {modelId}</div>
  ),
}))

describe('Official pricing page layout', () => {
  afterEach(cleanup)

  test('manages official prices independently from channel models', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <OfficialPricing />
      </QueryClientProvider>
    )

    expect(
      screen.getByRole('heading', { name: 'Official Model Prices' })
    ).toBeVisible()
    expect(await screen.findByText('openai/gpt-test')).toBeVisible()
    const manageButton = screen.getByRole('button', {
      name: 'Manage Official Price',
    })
    expect(manageButton).toBeEnabled()

    fireEvent.click(manageButton)

    expect(await screen.findByText('Official price editor for 7')).toBeVisible()
  })
})
