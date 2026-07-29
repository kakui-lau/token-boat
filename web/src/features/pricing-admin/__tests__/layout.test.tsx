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
import { ModelPriceOverview } from '../components/model-price-overview'
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
    expect(screen.getByText('Video output')).toBeVisible()
    expect(screen.queryByText('Video input')).not.toBeInTheDocument()
    expect(screen.getByText('Unit price')).toBeVisible()
    expect(screen.getByText('Quantity covered by unit price')).toBeVisible()
    expect(
      screen.getByText(
        'The unit price applies to this quantity. Enter 1 for pricing per unit.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('spinbutton', {
        name: 'Quantity covered by unit price',
      })
    ).toHaveValue(1)
    expect(screen.getByText('second')).toBeVisible()
    expect(screen.queryByLabelText('Input / 1M tokens')).not.toBeInTheDocument()
  })

  test('shows provider endpoint prices for direct channel comparison', () => {
    render(
      <ModelPriceOverview
        isLoading={false}
        items={[
          {
            model_id: 3,
            model_name: 'openai/gpt-test',
            currency: 'USD',
            active_channel_count: 2,
            input: {
              unit_price: '1.5',
              currency: 'USD',
              channel_model_id: 1,
              channel_name: 'Channel A',
            },
            output: {
              unit_price: '6',
              currency: 'USD',
              channel_model_id: 2,
              channel_name: 'Channel B',
            },
            endpoints: [
              {
                channel_model_id: 1,
                channel_name: 'Channel A',
                upstream_model_name: 'provider-gpt-a',
                runtime_mode: 'v2',
                billing_mode: 'token',
                price_structure: 'flat',
                retail_input_unit_price: '1.5',
                retail_output_unit_price: '7',
                retail_cache_read_unit_price: '',
                retail_cache_write_unit_price: '',
              },
              {
                channel_model_id: 2,
                channel_name: 'Channel B',
                upstream_model_name: 'provider-gpt-b',
                runtime_mode: 'legacy',
                billing_mode: 'token',
                price_structure: 'flat',
                retail_input_unit_price: '2',
                retail_output_unit_price: '6',
                retail_cache_read_unit_price: '',
                retail_cache_write_unit_price: '',
              },
            ],
          },
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /openai\/gpt-test/i }))

    expect(screen.getByText('provider-gpt-a')).toBeVisible()
    expect(screen.getByText('provider-gpt-b')).toBeVisible()
    expect(screen.getAllByText('Channel A')).toHaveLength(2)
    expect(screen.getByText('V2 Pricing')).toBeVisible()
    expect(screen.getByText('Legacy Billing')).toBeVisible()
  })

  test('shows conditional video prices using their native billing unit', () => {
    render(
      <ModelPriceOverview
        isLoading={false}
        items={[
          {
            model_id: 8,
            model_name: 'bytedance/seedance-2.0',
            currency: 'USD',
            active_channel_count: 1,
            endpoints: [
              {
                channel_model_id: 9,
                channel_name: 'OpenRouter',
                upstream_model_name: 'bytedance/seedance-2.0',
                runtime_mode: 'v2',
                billing_mode: 'video_duration',
                price_structure: 'expression',
                retail_input_unit_price: '',
                retail_output_unit_price: '',
                retail_cache_read_unit_price: '',
                retail_cache_write_unit_price: '',
                retail_price_components:
                  '{"rules":[{"id":"480p","name":"480p","resolution":"480p","unit":"second","unit_size":"1","unit_price":"0.06726"}]}',
              },
            ],
          },
        ]}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /bytedance\/seedance-2.0/i })
    )

    expect(
      screen.getByText(
        'Prices follow each endpoint billing unit and pricing conditions.'
      )
    ).toBeVisible()
    expect(screen.getByText('480p:')).toBeVisible()
    expect(screen.getByText('0.06726 USD')).toBeVisible()
    expect(screen.getByText(/1 second/)).toBeVisible()
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

  test('applies the OpenRouter per-second video pricing template', () => {
    const onChange = vi.fn()
    const version: OfficialPriceVersion = {
      id: 0,
      model_id: 3,
      billing_mode: 'video_duration',
      price_structure: 'expression',
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
      <OfficialPriceConfigurationEditor version={version} onChange={onChange} />
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Apply OpenRouter video template',
      })
    )

    const updatedVersion = onChange.mock.calls[0][0] as OfficialPriceVersion
    const components = JSON.parse(updatedVersion.price_components) as {
      provider_reference: { video_token_unit_price: string }
      rules: Array<{
        resolution: string
        unit_price: string
        with_audio: string
      }>
    }
    expect(components.provider_reference.video_token_unit_price).toBe('7')
    expect(components.rules).toHaveLength(5)
    expect(components.rules.slice(0, 4).map((rule) => rule.resolution)).toEqual(
      ['480p', '720p', '1080p', '4K']
    )
    expect(components.rules.map((rule) => rule.unit_price)).toEqual([
      '0.06726',
      '0.1512',
      '0.3402',
      '1.361',
      '1.361',
    ])
    expect(components.rules.every((rule) => rule.with_audio === '')).toBe(true)
    expect(updatedVersion.billing_expr).toContain(
      'param("resolution") == "480p"'
    )
    expect(updatedVersion.billing_expr).toContain('video_s / 1 * 1.361')
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

    expect(screen.getByText('ID #12')).toBeVisible()
    expect(screen.getByText('ID #11')).toBeVisible()
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
