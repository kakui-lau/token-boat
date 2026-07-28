// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ChannelModelDialog } from '../components/channel-model-dialog'
import { OfficialPricePanel } from '../components/official-price-panel'
import { PriceEditorSheet } from '../components/price-editor-sheet'
import type { ChannelModel } from '../types'

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
        isSuspending={false}
        isDeleting={false}
        onPublish={vi.fn()}
        onSuspend={vi.fn()}
        onDelete={vi.fn()}
        onCreated={vi.fn().mockResolvedValue(undefined)}
      />
    )

    expect(
      screen
        .getByRole('heading', { name: 'Create official price draft' })
        .closest('form')
    ).toHaveClass('pricing-form-surface')
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
