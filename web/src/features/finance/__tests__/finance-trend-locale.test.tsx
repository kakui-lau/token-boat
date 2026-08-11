// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { FinanceTrendReport } from '../components/finance-trend-report'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zhCN', resolvedLanguage: 'zhCN' },
  }),
}))

vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

vi.mock('@visactor/react-vchart', () => ({
  VChart: (props: {
    spec: {
      yField?: string
      tooltip?: {
        dimension?: {
          content?: Array<{
            value?: (datum: Record<string, unknown>) => string
          }>
        }
      }
    }
  }) => {
    const tooltipValue =
      props.spec.yField === 'consumedQuota'
        ? props.spec.tooltip?.dimension?.content?.[0]?.value?.({
            consumedQuota: 500000,
          })
        : undefined
    return (
      <div
        data-testid='finance-trend-chart'
        data-tooltip-value={tooltipValue}
      />
    )
  },
}))

vi.mock('../api', () => ({
  getFinanceTrend: vi.fn().mockResolvedValue({
    success: true,
    data: {
      start_at: 1_700_000_000,
      end_at: 1_700_086_400,
      interval: 'day',
      points: [
        {
          bucket_start: 1_700_000_000,
          total_orders: 1,
          success_orders: 1,
          pending_orders: 0,
          failed_orders: 0,
          expired_orders: 0,
          success_amount: 10,
          consumed_quota: 500000,
          request_count: 3,
          token_count: 120,
        },
      ],
    },
  }),
}))

afterEach(cleanup)

describe('finance trend locale formatting', () => {
  test('renders with the zhCN interface language without an Intl RangeError', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <FinanceTrendReport period='30d' />
      </QueryClientProvider>
    )

    expect(await screen.findByText('Payment success rate')).toBeVisible()
    expect(screen.getByText('100%')).toBeVisible()
    expect(screen.getByText('Total consumption')).toBeVisible()
    expect(screen.getAllByTestId('finance-trend-chart')).toHaveLength(3)
    expect(
      screen
        .getAllByTestId('finance-trend-chart')
        .find((chart) => chart.dataset.tooltipValue)
    ).toHaveAttribute('data-tooltip-value', '$1')
  })
})
