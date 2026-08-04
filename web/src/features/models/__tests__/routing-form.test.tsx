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
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModelMutateDrawer } from '../components/drawers/model-mutate-drawer'

const apiMocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  updateModel: vi.fn(),
  getModel: vi.fn(),
  getModelRoutingTargets: vi.fn(),
  getVendors: vi.fn(),
}))

vi.mock('../api', () => apiMocks)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/features/system-settings/hooks/use-system-options', () => ({
  useSystemOptions: () => ({ data: { data: [] } }),
  getOptionValue: (
    _options: Array<{ key: string; value: string }>,
    defaults: Record<string, unknown>
  ) => defaults,
}))
vi.mock('@/features/system-settings/hooks/use-update-option', () => ({
  useUpdateOption: () => ({ mutateAsync: vi.fn() }),
}))

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('model routing form', () => {
  it('shows alias-only target fields and hides duplicate route and price fields', async () => {
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: { items: [] },
    })
    apiMocks.getModelRoutingTargets.mockResolvedValue({
      success: true,
      data: [{ id: 47, model_name: 'openai/gpt-5.6-terra' }],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModelMutateDrawer open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    expect(screen.getByLabelText('Visibility')).toBeVisible()
    expect(screen.queryByLabelText('Routing target')).not.toBeInTheDocument()

    const routingMode = screen.getByLabelText('Routing mode')
    fireEvent.pointerDown(routingMode, { button: 0 })
    fireEvent.click(routingMode)
    const aliasOption = await screen.findByRole('option', {
      name: 'System alias',
    })
    fireEvent.pointerDown(aliasOption, { button: 0 })
    fireEvent.click(aliasOption)

    expect(await screen.findByLabelText('Routing target')).toBeVisible()
    expect(screen.queryByLabelText('Visibility')).not.toBeInTheDocument()
    expect(screen.getByText('No duplicate pricing required')).toBeVisible()

    const pricingHeading = screen.getByText('Pricing Configuration')
    expect(pricingHeading.closest('section')).toHaveClass('hidden')
    const matchingHeading = screen.getByText('Matching Rules')
    expect(matchingHeading.closest('section')).toHaveClass('hidden')

    fireEvent.click(screen.getByLabelText('Routing target'))
    expect(
      await screen.findByRole('option', { name: 'openai/gpt-5.6-terra' })
    ).toBeVisible()
  })

  it('submits a system alias without duplicate route or pricing fields', async () => {
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: { items: [] },
    })
    apiMocks.getModelRoutingTargets.mockResolvedValue({
      success: true,
      data: [{ id: 47, model_name: 'openai/gpt-5.6-terra' }],
    })
    apiMocks.createModel.mockResolvedValue({ success: true, data: {} })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModelMutateDrawer open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    )

    fireEvent.change(screen.getByLabelText('Model Name *'), {
      target: { value: 'codex-auto-review' },
    })

    const routingMode = screen.getByLabelText('Routing mode')
    fireEvent.pointerDown(routingMode, { button: 0 })
    fireEvent.click(routingMode)
    const aliasOption = await screen.findByRole('option', {
      name: 'System alias',
    })
    fireEvent.pointerDown(aliasOption, { button: 0 })
    fireEvent.click(aliasOption)

    const routingTarget = await screen.findByLabelText('Routing target')
    fireEvent.pointerDown(routingTarget, { button: 0 })
    fireEvent.click(routingTarget)
    const targetOption = await screen.findByRole('option', {
      name: 'openai/gpt-5.6-terra',
    })
    fireEvent.pointerDown(targetOption, { button: 0 })
    fireEvent.click(targetOption)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(apiMocks.createModel).toHaveBeenCalledTimes(1)
    })
    expect(apiMocks.createModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model_name: 'codex-auto-review',
        visibility: 'internal',
        model_purpose: 'approval_review',
        routing_target_model_id: 47,
        sync_official: 0,
        name_rule: 0,
        endpoints: '',
      })
    )
    const submitted = apiMocks.createModel.mock.calls[0]?.[0]
    expect(submitted).not.toHaveProperty('routing_mode')
    expect(submitted).not.toHaveProperty('price')
    expect(submitted).not.toHaveProperty('ratio')
  })
})
