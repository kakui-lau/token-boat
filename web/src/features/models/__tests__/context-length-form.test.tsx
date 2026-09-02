/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

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
import type { Model } from '../types'

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

describe('model limits form', () => {
  it('loads and submits verified model limits', async () => {
    const verifiedAt = Math.floor(new Date('2026-09-01T08:00').getTime() / 1000)
    const model: Model = {
      id: 94,
      model_name: 'anthropic/claude-fable-5',
      context_length: 200_000,
      max_output_tokens: 8192,
      limits_source_url: 'https://docs.vendor.example/models/model',
      limits_verified_at: verifiedAt,
      status: 1,
      sync_official: 1,
      created_time: 1,
      updated_time: 1,
      name_rule: 0,
    }
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: { items: [] },
    })
    apiMocks.getModelRoutingTargets.mockResolvedValue({
      success: true,
      data: [],
    })
    apiMocks.getModel.mockResolvedValue({ success: true, data: model })
    apiMocks.updateModel.mockResolvedValue({ success: true, data: model })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModelMutateDrawer open onOpenChange={vi.fn()} currentRow={model} />
      </QueryClientProvider>
    )

    const contextInput = await screen.findByLabelText('Context')
    const outputInput = screen.getByLabelText('Maximum output tokens')
    const sourceInput = screen.getByLabelText('Official limits source URL')
    const verifiedInput = screen.getByLabelText('Limits verified at')
    await waitFor(() => expect(contextInput).toHaveValue(200_000))
    expect(outputInput).toHaveValue(8192)
    expect(sourceInput).toHaveValue('https://docs.vendor.example/models/model')
    expect(verifiedInput).toHaveValue('2026-09-01T08:00')

    fireEvent.change(contextInput, { target: { value: '1000000' } })
    fireEvent.change(outputInput, { target: { value: '32768' } })
    fireEvent.change(sourceInput, {
      target: { value: 'https://docs.vendor.example/models/model-v2' },
    })
    fireEvent.change(verifiedInput, {
      target: { value: '2026-09-01T12:30' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update Model' }))

    await waitFor(() => expect(apiMocks.updateModel).toHaveBeenCalledTimes(1))
    expect(apiMocks.updateModel).toHaveBeenCalledWith(
      expect.objectContaining({
        context_length: 1_000_000,
        max_output_tokens: 32_768,
        limits_source_url: 'https://docs.vendor.example/models/model-v2',
        limits_verified_at: Math.floor(
          new Date('2026-09-01T12:30').getTime() / 1000
        ),
      })
    )
  })

  it('rejects contradictory limits and incomplete provenance', async () => {
    const model: Model = {
      id: 95,
      model_name: 'test/model',
      context_length: 100,
      status: 1,
      sync_official: 1,
      created_time: 1,
      updated_time: 1,
      name_rule: 0,
    }
    apiMocks.getVendors.mockResolvedValue({
      success: true,
      data: { items: [] },
    })
    apiMocks.getModelRoutingTargets.mockResolvedValue({
      success: true,
      data: [],
    })
    apiMocks.getModel.mockResolvedValue({ success: true, data: model })
    apiMocks.updateModel.mockResolvedValue({ success: true, data: model })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModelMutateDrawer open onOpenChange={vi.fn()} currentRow={model} />
      </QueryClientProvider>
    )

    await waitFor(() =>
      expect(screen.getByLabelText('Context')).toHaveValue(100)
    )
    const outputInput = screen.getByLabelText('Maximum output tokens')
    fireEvent.change(outputInput, { target: { value: '101' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update Model' }))

    expect(
      await screen.findByText(
        'Maximum output tokens cannot exceed the context window.'
      )
    ).toBeVisible()
    expect(apiMocks.updateModel).not.toHaveBeenCalled()

    fireEvent.change(outputInput, { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Official limits source URL'), {
      target: { value: 'https://docs.vendor.example/models/model' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update Model' }))

    expect(
      await screen.findByText(
        'Add both the official source and verification time, or leave both empty.'
      )
    ).toBeVisible()
    expect(apiMocks.updateModel).not.toHaveBeenCalled()
  })
})
