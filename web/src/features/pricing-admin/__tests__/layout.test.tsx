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
import { OfficialPriceConfigurationEditor } from '../components/official-price-configuration-editor'
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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
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
    expect(screen.getByText('Price Configuration')).toBeVisible()
    expect(
      screen.getByText(
        'Billing mode defines what usage is measured, such as tokens, requests, images, audio duration, or video duration.'
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        'Use one unit price for all usage. This is the recommended choice for most models.'
      )
    ).toBeVisible()
  })

  test('adapts official flat-price fields to the selected billing mode', () => {
    const version: OfficialPriceVersion = {
      id: 0,
      model_id: 3,
      billing_mode: 'video_duration',
      price_structure: 'flat',
      price_components: '{}',
      billing_expr: '',
      currency: 'USD',
      version: 0,
      status: 'draft',
      source: 'manual',
      remark: '',
      effective_from: 0,
      effective_to: 0,
    }
    render(
      <OfficialPriceConfigurationEditor version={version} onChange={vi.fn()} />
    )

    expect(screen.getByText('Billing component')).toBeVisible()
    expect(screen.getByText('Unit price')).toBeVisible()
    expect(screen.queryByLabelText('Input / 1M tokens')).not.toBeInTheDocument()
  })

  test('provides a structured tier editor for non-token billing', () => {
    const version: OfficialPriceVersion = {
      id: 0,
      model_id: 3,
      billing_mode: 'request',
      price_structure: 'tiered',
      price_components:
        '{"rules":[{"id":"tier-1","name":"standard","component":"request","unit":"request","unit_size":"1","unit_price":"1","upper_bound":"100"},{"id":"tier-2","name":"default","component":"request","unit":"request","unit_size":"1","unit_price":"2","upper_bound":""}]}',
      billing_expr: '',
      currency: 'USD',
      version: 0,
      status: 'draft',
      source: 'manual',
      remark: '',
      effective_from: 0,
      effective_to: 0,
    }
    render(
      <OfficialPriceConfigurationEditor version={version} onChange={vi.fn()} />
    )

    expect(screen.getByText('Tier 1')).toBeVisible()
    expect(screen.getByText('Default rule')).toBeVisible()
    expect(screen.getByText('Usage upper bound')).toBeVisible()
    expect(screen.getAllByText('Unit price')).toHaveLength(2)
    expect(screen.getAllByText('Billing component')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add tier' })).toBeEnabled()
    expect(
      screen.getByText(
        'Use tiered pricing only when the unit price changes after a usage or context threshold.'
      )
    ).toBeVisible()
  })

  test('provides a simple rule editor before the advanced expression for non-token billing', () => {
    const version: OfficialPriceVersion = {
      id: 0,
      model_id: 3,
      billing_mode: 'video_duration',
      price_structure: 'expression',
      price_components: '{}',
      billing_expr:
        'v2:param("resolution") == "1080p" ? tier("1080p", video_s * 0.4) : tier("default", video_s * 0.2)',
      currency: 'USD',
      version: 0,
      status: 'draft',
      source: 'manual',
      remark: '',
      effective_from: 0,
      effective_to: 0,
    }

    render(
      <OfficialPriceConfigurationEditor version={version} onChange={vi.fn()} />
    )

    expect(screen.getByText('Price rule 1')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Operation' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Quality' })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Resolution' })).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: 'Resolution' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add price rule' })).toBeEnabled()
    expect(screen.getByText('Advanced expression')).toBeVisible()
    expect(screen.queryByLabelText('Billing Expression')).not.toBeVisible()
  })

  test('does not expose internal price-component JSON in expression mode', () => {
    const version: OfficialPriceVersion = {
      id: 0,
      model_id: 3,
      billing_mode: 'token',
      price_structure: 'expression',
      price_components: '{}',
      billing_expr: 'v1:tier("custom", p * 1)',
      currency: 'USD',
      version: 0,
      status: 'draft',
      source: 'manual',
      remark: '',
      effective_from: 0,
      effective_to: 0,
    }
    render(
      <OfficialPriceConfigurationEditor version={version} onChange={vi.fn()} />
    )

    expect(screen.getByDisplayValue('v1:tier("custom", p * 1)')).toBeVisible()
    expect(screen.queryByLabelText('Price Components')).not.toBeInTheDocument()
  })

  test('switches the new-version editor from token fields to the selected mode', async () => {
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

    const selectors = screen.getAllByRole('combobox')
    fireEvent.click(selectors[0])
    const videoOption = await screen.findByRole('option', {
      name: 'Video duration',
    })
    fireEvent.pointerDown(videoOption)
    fireEvent.pointerUp(videoOption)
    fireEvent.click(videoOption)

    expect(selectors[0]).toHaveTextContent('Video duration')
    expect(selectors[1]).toHaveTextContent('Flat rate')
    expect(screen.getByText('Billing component')).toBeVisible()
    expect(screen.getByText('Unit price')).toBeVisible()
    expect(screen.queryByLabelText('Input / 1M tokens')).not.toBeInTheDocument()
  })

  test('opens token tiered pricing in the visual editor', async () => {
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

    const selectors = screen.getAllByRole('combobox')
    fireEvent.click(selectors[1])
    const tieredOption = await screen.findByRole('option', {
      name: 'Tiered pricing',
    })
    fireEvent.pointerDown(tieredOption)
    fireEvent.pointerUp(tieredOption)
    fireEvent.click(tieredOption)

    expect(screen.getByText('Visual editor')).toBeVisible()
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
    expect(screen.queryByLabelText('Price Components')).not.toBeInTheDocument()
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
