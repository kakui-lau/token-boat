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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { updateOfficialFlatDraft } from '../api'
import { ChannelModelDialog } from '../components/channel-model-dialog'
import { OfficialPricePanel } from '../components/official-price-panel'
import { PriceEditorSheet } from '../components/price-editor-sheet'
import type { ChannelModel, OfficialPriceVersion } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href='/official-pricing'>{children}</a>
  ),
}))

vi.mock('../api', () => ({
  createChannelModel: vi.fn(),
  createOfficialFlatDraft: vi.fn(),
  createOfficialPriceDraft: vi.fn().mockResolvedValue({ data: {} }),
  deletePriceDraft: vi.fn(),
  getActivePriceBundle: vi.fn().mockResolvedValue({
    data: {
      official_price: { version: 4 },
      purchase_price: { version: 5 },
      retail_price: { version: 6 },
      revision: 'revision-123',
    },
  }),
  getOfficialPriceVersions: vi.fn().mockResolvedValue({ data: [] }),
  getPricingCatalogOptions: vi.fn().mockResolvedValue({
    data: { channels: [], models: [] },
  }),
  getPurchasePriceVersions: vi.fn().mockResolvedValue({ data: [] }),
  getRetailPriceVersions: vi.fn().mockResolvedValue({ data: [] }),
  publishPriceVersion: vi.fn(),
  suspendPriceVersion: vi.fn(),
  updateChannelModel: vi.fn(),
  updateOfficialFlatDraft: vi.fn().mockResolvedValue({ data: {} }),
  updateOfficialPriceDraft: vi.fn().mockResolvedValue({ data: {} }),
}))

const channelModel: ChannelModel = {
  id: 1,
  channel_id: 2,
  channel_name: 'Enterprise Channel',
  model_id: 3,
  model_name: 'openai/gpt-test',
  currency: 'USD',
  upstream_model_name: 'provider-gpt-test',
  status: 1,
  priority: 0,
  weight: 0,
  region: '',
  runtime_mode: 'legacy',
}

function renderWithQueryClient(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  )
}

describe('Pricing admin editor layout', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(cleanup)

  test('uses a wide pricing workspace for channel-specific pricing tabs', () => {
    renderWithQueryClient(
      <PriceEditorSheet channelModel={channelModel} onOpenChange={vi.fn()} />
    )

    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:w-[92vw]',
      'sm:max-w-6xl'
    )
    expect(screen.getByRole('tablist')).toHaveClass('grid-cols-3')
  })

  test('uses a wider scrollable dialog for channel model editing', () => {
    renderWithQueryClient(
      <ChannelModelDialog
        open
        channelModel={channelModel}
        onOpenChange={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:max-w-2xl',
      'max-h-[90vh]',
      'overflow-y-auto'
    )
  })

  test('uses an opaque high-contrast surface for official price inputs', () => {
    renderWithQueryClient(
      <OfficialPricePanel
        modelId={3}
        versions={[]}
        isPublishing={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(
      screen
        .getByRole('heading', { name: 'New Official Version' })
        .closest('form')
    ).toHaveClass('pricing-form-surface')
  })

  test('keeps active official revisions as history without a suspend action', () => {
    renderWithQueryClient(
      <OfficialPricePanel
        modelId={3}
        versions={[
          {
            id: 13,
            model_id: 3,
            billing_mode: 'token',
            price_structure: 'flat',
            price_components: '{"input_unit_price":"2"}',
            billing_expr: 'p * 2',
            currency: 'USD',
            version: 3,
            status: 'active',
            source: 'official_api',
            remark: '',
            effective_from: 1,
            effective_to: 0,
          },
        ]}
        isPublishing={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'Suspend' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View' })).toBeEnabled()
  })

  test('adapts the editor when duplicating a non-token official revision', () => {
    renderWithQueryClient(
      <OfficialPricePanel
        modelId={3}
        versions={[
          {
            id: 14,
            model_id: 3,
            billing_mode: 'video_duration',
            price_structure: 'expression',
            price_components: '{"video_second_unit_price":"0.2"}',
            billing_expr: 'v1:tier("base", 0.2)',
            currency: 'USD',
            version: 4,
            status: 'expired',
            source: 'official_api',
            remark: 'video pricing',
            effective_from: 1,
            effective_to: 2,
          },
        ]}
        isPublishing={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    expect(screen.getByLabelText('Billing Mode')).toHaveValue('video_duration')
    expect(screen.getByLabelText('Price Structure')).toHaveValue('expression')
    expect(screen.getByLabelText('Price Components')).toHaveValue(
      '{"video_second_unit_price":"0.2"}'
    )
    expect(screen.getByLabelText('Billing Expression')).toHaveValue(
      'v1:tier("base", 0.2)'
    )
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled()
  })

  test('copies historical prices and updates an existing draft', async () => {
    const versions: OfficialPriceVersion[] = [
      {
        id: 12,
        model_id: 3,
        billing_mode: 'token',
        price_structure: 'flat',
        price_components: '{"input_unit_price":"2.5","output_unit_price":"10"}',
        billing_expr: 'p * 2.5 + c * 10',
        currency: 'USD',
        version: 2,
        status: 'draft',
        source: 'manual',
        remark: 'draft note',
        effective_from: 0,
        effective_to: 0,
      },
      {
        id: 11,
        model_id: 3,
        billing_mode: 'token',
        price_structure: 'flat',
        price_components: '{"input_unit_price":"2","output_unit_price":"8"}',
        billing_expr: 'p * 2 + c * 8',
        currency: 'USD',
        version: 1,
        status: 'expired',
        source: 'manual',
        remark: 'history',
        effective_from: 1,
        effective_to: 2,
      },
    ]
    renderWithQueryClient(
      <OfficialPricePanel
        modelId={3}
        versions={versions}
        isPublishing={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onDelete={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    const templateButtons = screen.getAllByRole('button', { name: 'Duplicate' })
    fireEvent.click(templateButtons[1])
    expect(screen.getByLabelText('Input / 1M tokens')).toHaveValue('2')
    expect(screen.getByLabelText('Output / 1M tokens')).toHaveValue('8')
    expect(screen.getByText('Based on Version {{version}}')).toBeVisible()

    const viewButtons = screen.getAllByRole('button', { name: 'View' })
    fireEvent.click(viewButtons[1])
    expect(
      screen.getByRole('dialog', { name: 'Version Configuration · v1' })
    ).toBeVisible()
    expect(screen.getByText('p * 2 + c * 8')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(
      screen.getByRole('heading', { name: 'Edit Official Version' })
    ).toBeVisible()
    const inputPrice = screen.getByLabelText('Input / 1M tokens')
    fireEvent.change(inputPrice, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      expect(updateOfficialFlatDraft).toHaveBeenCalledWith(
        12,
        expect.objectContaining({
          model_id: 3,
          prices: expect.objectContaining({ input_unit_price: '3' }),
        })
      )
    })
  })

  test('shows the active official, purchase, and retail version chain', async () => {
    renderWithQueryClient(
      <PriceEditorSheet channelModel={channelModel} onOpenChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText(/revision-123/)).toBeInTheDocument()
    })
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByText('Version 5')).toBeInTheDocument()
    expect(screen.getByText('Version 6')).toBeInTheDocument()
  })
})
