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
  getOfficialPriceOverview: vi.fn().mockResolvedValue({
    data: [
      {
        model_id: 7,
        model_name: 'openai/gpt-test',
        status: 'active',
        currency: 'USD',
        billing_mode: 'token',
        price_structure: 'flat',
        version: 2,
        version_count: 2,
        draft_count: 0,
        effective_from: 1_700_000_000,
        input_unit_price: '1.25',
        output_unit_price: '5',
        cache_read_unit_price: '',
        cache_write_unit_price: '',
        image_input_unit_price: '',
        image_output_unit_price: '',
        audio_input_unit_price: '',
        audio_output_unit_price: '',
        request_unit_price: '',
        video_second_unit_price: '',
      },
    ],
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
    expect(screen.getByText('USD 1.25')).toBeVisible()
    expect(screen.getByText('USD 5')).toBeVisible()
    expect(screen.getByText('Active official prices')).toBeVisible()
    const manageButton = screen.getByRole('button', {
      name: 'Manage Official Price',
    })
    expect(manageButton).toBeEnabled()

    fireEvent.click(manageButton)

    expect(await screen.findByText('Official price editor for 7')).toBeVisible()
  })
})
