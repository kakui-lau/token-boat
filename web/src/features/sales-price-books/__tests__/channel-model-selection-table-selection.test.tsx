// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { ChannelModel } from '@/features/pricing-admin/types'

import { ChannelModelSelectionTable } from '../components/channel-model-selection-table'

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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function channelModel(
  id: number,
  modelName: string,
  purchasePriceVersionId: number
): ChannelModel {
  return {
    id,
    channel_id: 1,
    channel_name: 'Primary channel',
    model_id: id,
    model_name: modelName,
    currency: 'USD',
    upstream_model_name: modelName,
    status: 1,
    routing_enabled: true,
    priority: 0,
    weight: 0,
    region: '',
    active_purchase_price_version_id: purchasePriceVersionId,
    active_purchase_price_version: purchasePriceVersionId > 0 ? 1 : 0,
    purchase_pricing_mode: purchasePriceVersionId > 0 ? 'fixed' : '',
    purchase_discount: '',
  }
}

test('select current page excludes channel models without an active purchase price', () => {
  const onSelectionChange = vi.fn()
  const eligible = channelModel(11, 'openai/gpt-priced', 5)
  const unpriced = channelModel(12, 'openai/gpt-unpriced', 0)

  render(
    <ChannelModelSelectionTable
      items={[eligible, unpriced]}
      filters={{
        keyword: '',
        channelId: '',
        status: '1',
        routingStatus: '',
        purchaseStatus: 'published',
      }}
      channels={[{ id: 1, name: 'Primary channel' }]}
      selectedIds={new Set([99])}
      generatedModelIds={new Set()}
      total={2}
      page={1}
      pageSize={200}
      isLoading={false}
      isFetching={false}
      isError={false}
      onRetry={vi.fn()}
      onFiltersChange={vi.fn()}
      onSelectionChange={onSelectionChange}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
    />
  )

  expect(
    screen.getByRole('checkbox', { name: 'Select openai/gpt-unpriced' })
  ).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText('2 channel models')).toBeInTheDocument()
  expect(
    screen
      .getAllByText('Selected outside current page: 1')
      .some((element) => element.classList.contains('text-destructive'))
  ).toBe(true)
  expect(
    screen.getByText(
      'Hidden selected channel models: 1. They will also be generated.'
    )
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Select current page' }))

  expect(onSelectionChange).toHaveBeenCalledOnce()
  expect([...onSelectionChange.mock.calls[0][0]]).toEqual([eligible.id])
})

test('adds the current page only when the cumulative selection action is used', () => {
  const onSelectionChange = vi.fn()
  const eligible = channelModel(31, 'openai/gpt-current', 5)

  render(
    <ChannelModelSelectionTable
      items={[eligible]}
      filters={{
        keyword: '',
        channelId: '',
        status: '1',
        routingStatus: '',
        purchaseStatus: 'published',
      }}
      channels={[{ id: 1, name: 'Primary channel' }]}
      selectedIds={new Set([99])}
      generatedModelIds={new Set()}
      total={1}
      page={1}
      pageSize={200}
      isLoading={false}
      isFetching={false}
      isError={false}
      onRetry={vi.fn()}
      onFiltersChange={vi.fn()}
      onSelectionChange={onSelectionChange}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
    />
  )

  fireEvent.click(
    screen.getByRole('button', { name: 'Add current page to selection' })
  )

  expect(onSelectionChange).toHaveBeenCalledOnce()
  expect([...onSelectionChange.mock.calls[0][0]]).toEqual([99, eligible.id])
})

test('marks generated models and selects only ungenerated models on the current page', () => {
  const onSelectionChange = vi.fn()
  const generated = channelModel(21, 'openai/gpt-generated', 5)
  const notGenerated = channelModel(22, 'openai/gpt-new', 6)

  render(
    <ChannelModelSelectionTable
      items={[generated, notGenerated]}
      filters={{
        keyword: '',
        channelId: '',
        status: '1',
        routingStatus: '',
        purchaseStatus: 'published',
      }}
      channels={[{ id: 1, name: 'Primary channel' }]}
      selectedIds={new Set()}
      generatedModelIds={new Set([generated.model_id])}
      total={2}
      page={1}
      pageSize={200}
      isLoading={false}
      isFetching={false}
      isError={false}
      onRetry={vi.fn()}
      onFiltersChange={vi.fn()}
      onSelectionChange={onSelectionChange}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
    />
  )

  expect(
    within(
      screen.getByRole('row', { name: /openai\/gpt-generated/ })
    ).getByText('Generated')
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('row', { name: /openai\/gpt-new/ })).getByText(
      'Not generated'
    )
  ).toBeInTheDocument()

  fireEvent.click(
    screen.getByRole('button', {
      name: 'Select ungenerated on current page',
    })
  )

  expect(onSelectionChange).toHaveBeenCalledOnce()
  expect([...onSelectionChange.mock.calls[0][0]]).toEqual([notGenerated.id])
})
