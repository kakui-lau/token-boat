/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'

import { ModelAvailabilityOverview } from '../model-availability-overview'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/features/performance-metrics/api', () => ({
  getPerfMetricsSummary: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('model availability overview', () => {
  test('ranks measured text models and hides metrics outside the visible model list', async () => {
    vi.mocked(getPerfMetricsSummary).mockImplementation(async (hours) => ({
      success: true,
      data: {
        models:
          hours === 24
            ? [
                modelMetric('fast-model', 40, 99, 80),
                modelMetric('steady-model', 50, 98, 30),
                modelMetric('bytedance/seedance-2.0-fast-upscale', 3, 100, 100),
              ]
            : [
                modelMetric('steady-model', 80, 99.5, 30, [98, 99, 100]),
                modelMetric('fast-model', 60, 97, 80),
                modelMetric('bytedance/seedance-2.0-fast-upscale', 3, 100, 100),
              ],
      },
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ModelAvailabilityOverview
          modelNames={['fast-model', 'steady-model']}
        />
      </QueryClientProvider>
    )

    const fastestHeading = await screen.findByRole('heading', {
      name: 'Fastest models',
    })
    const fastestPanel = fastestHeading.closest('article')
    expect(fastestPanel).not.toBeNull()
    const fastestRows = await within(fastestPanel as HTMLElement).findAllByRole(
      'listitem'
    )
    expect(fastestRows[0]).toHaveTextContent('fast-model')
    expect(fastestRows[1]).toHaveTextContent('steady-model')
    expect(
      screen.queryByText('bytedance/seedance-2.0-fast-upscale')
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('img', {
        name: 'Recent observations: 98.00%, 99.00%, 100.00%',
      })
    ).toBeInTheDocument()
  })
})

function modelMetric(
  modelName: string,
  requestCount: number,
  successRate: number,
  averageTps: number,
  recentSuccessRates?: number[]
) {
  return {
    model_name: modelName,
    request_count: requestCount,
    success_rate: successRate,
    avg_tps: averageTps,
    avg_latency_ms: 500,
    recent_success_rates: recentSuccessRates,
  }
}
