// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { ActivePriceBundlePanel } from '../components/active-price-bundle-panel'
import type { PurchasePriceVersion } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: number }) =>
      values?.version
        ? key.replace('{{version}}', String(values.version))
        : key,
  }),
}))

vi.mock('../api', () => ({
  getActivePriceBundle: vi
    .fn()
    .mockRejectedValue(new Error('record not found')),
}))

afterEach(cleanup)

const activePurchase: PurchasePriceVersion = {
  id: 42,
  channel_model_id: 3,
  official_price_version_id: 8,
  pricing_mode: 'official_ratio',
  billing_mode: 'video_duration',
  price_structure: 'expression',
  price_components: '{}',
  input_unit_price: '',
  output_unit_price: '',
  cache_read_unit_price: '',
  cache_write_unit_price: '',
  currency: 'USD',
  version: 7,
  status: 'active',
  purchase_discount: '0.65',
  purchase_billing_expr: 'v2:tier("default", video_seconds * 0.22)',
  expression_source: 'generated',
  expression_schema_version: 'v2',
  price_unit: 'expression',
  quote_reference: '',
  contract_reference: '',
  conditions: '',
  remark: '',
  effective_from: 1,
  effective_to: 0,
}

test('explains which publication step is missing from the active chain', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ActivePriceBundlePanel
        channelModelId={3}
        purchaseVersions={[activePurchase]}
        retailVersions={[]}
      />
    </QueryClientProvider>
  )

  expect(
    await screen.findByText(
      'Publish a retail price linked to purchase version 7 to complete the active version chain.'
    )
  ).toBeVisible()
})
