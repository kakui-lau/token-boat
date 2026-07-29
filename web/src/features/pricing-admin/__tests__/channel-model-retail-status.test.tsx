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
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { getChannelModels } from '../api'
import { PricingAdmin } from '../index'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/'>{children}</a>
  ),
}))

vi.mock('../api', () => ({
  getChannelModels: vi.fn(),
  getPricingCatalogOptions: vi.fn().mockResolvedValue({
    data: { channels: [], models: [] },
  }),
  syncLegacyChannelModels: vi.fn(),
}))

function renderPricingAdmin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <PricingAdmin />
    </QueryClientProvider>
  )
}

describe('channel model retail publication status', () => {
  beforeEach(() => {
    vi.mocked(getChannelModels).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 11,
            channel_id: 1,
            channel_name: 'Published Channel',
            model_id: 101,
            model_name: 'published-model',
            currency: 'USD',
            upstream_model_name: 'published-provider-model',
            status: 1,
            priority: 0,
            weight: 0,
            region: '',
            runtime_mode: 'legacy',
            active_retail_price_version_id: 301,
            active_retail_price_version: 3,
          },
          {
            id: 12,
            channel_id: 1,
            channel_name: 'Unpublished Channel',
            model_id: 102,
            model_name: 'unpublished-model',
            currency: 'USD',
            upstream_model_name: 'unpublished-provider-model',
            status: 1,
            priority: 0,
            weight: 0,
            region: '',
            runtime_mode: 'legacy',
            active_retail_price_version_id: 0,
            active_retail_price_version: 0,
          },
        ],
        total: 2,
        page: 1,
        page_size: 50,
      },
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('shows the active retail version and supports publication filtering', async () => {
    renderPricingAdmin()

    const publishedRow = (await screen.findByText('published-model')).closest(
      'tr'
    )
    const unpublishedRow = screen.getByText('unpublished-model').closest('tr')
    if (!publishedRow || !unpublishedRow) {
      throw new Error('expected both channel model rows')
    }
    expect(within(publishedRow).getByText('Published')).toBeVisible()
    expect(within(publishedRow).getByText('v3')).toBeVisible()
    expect(within(unpublishedRow).getByText('Not Published')).toBeVisible()

    fireEvent.change(screen.getByLabelText('Retail Status'), {
      target: { value: 'published' },
    })

    await waitFor(() => {
      expect(getChannelModels).toHaveBeenLastCalledWith(
        expect.objectContaining({ retail_status: 'published' })
      )
    })
  })
})
