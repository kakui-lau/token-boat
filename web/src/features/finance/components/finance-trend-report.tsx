import { useQuery } from '@tanstack/react-query'
import { VChart } from '@visactor/react-vchart'
import type { ISpec } from '@visactor/vchart'
import { ChartNoAxesCombined, CircleDollarSign } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTheme } from '@/context/theme-provider'
import { toIntlLocale } from '@/i18n/languages'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { VCHART_OPTION } from '@/lib/vchart'

import { getFinanceTrend } from '../api'
import type { FinancePeriod } from '../types'

type FinanceTrendReportProps = {
  period: FinancePeriod
}

export function FinanceTrendReport(props: FinanceTrendReportProps) {
  const { t, i18n } = useTranslation()
  const { resolvedTheme } = useTheme()
  const trendQuery = useQuery({
    queryKey: ['finance', 'trend', props.period],
    queryFn: async () => {
      const response = await getFinanceTrend(props.period)
      if (!response.success) {
        throw new Error(response.message || t('Failed to load finance trends.'))
      }
      return response.data
    },
    staleTime: 30_000,
  })

  const chartData = useMemo(() => {
    const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
    return (trendQuery.data?.points ?? []).map((point) => ({
      date: new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(point.bucket_start * 1000)),
      revenue: point.success_amount,
      completed: point.success_orders,
      failed: point.failed_orders,
      expired: point.expired_orders,
      pending: point.pending_orders,
    }))
  }, [i18n.language, i18n.resolvedLanguage, trendQuery.data?.points])

  const orderChartData = useMemo(
    () =>
      chartData.flatMap((point) => [
        { date: point.date, status: t('Completed'), value: point.completed },
        { date: point.date, status: t('Failed'), value: point.failed },
        { date: point.date, status: t('Expired'), value: point.expired },
        { date: point.date, status: t('Pending'), value: point.pending },
      ]),
    [chartData, t]
  )

  const totals = useMemo(
    () =>
      chartData.reduce(
        (result, point) => ({
          revenue: result.revenue + point.revenue,
          completed: result.completed + point.completed,
          settled:
            result.settled + point.completed + point.failed + point.expired,
        }),
        { revenue: 0, completed: 0, settled: 0 }
      ),
    [chartData]
  )

  if (trendQuery.isLoading) {
    return <Skeleton className='h-[520px] w-full rounded-xl' />
  }
  if (trendQuery.isError) {
    return (
      <ErrorState
        title={t('Failed to load finance trends.')}
        description={
          trendQuery.error instanceof Error
            ? trendQuery.error.message
            : undefined
        }
        onRetry={() => void trendQuery.refetch()}
        className='min-h-80'
      />
    )
  }

  const successRate = totals.settled > 0 ? totals.completed / totals.settled : 0
  const chartTheme = resolvedTheme === 'dark' ? 'dark' : 'light'
  const revenueSpec: ISpec = {
    type: 'line',
    data: [{ id: 'revenue', values: chartData }],
    xField: 'date',
    yField: 'revenue',
    point: { visible: false },
    line: { style: { lineWidth: 2 } },
    theme: chartTheme,
    background: 'transparent',
  }
  const orderSpec: ISpec = {
    type: 'bar',
    data: [{ id: 'orders', values: orderChartData }],
    xField: 'date',
    yField: 'value',
    seriesField: 'status',
    stack: true,
    legends: { visible: true, orient: 'top' },
    theme: chartTheme,
    background: 'transparent',
  }

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-3'>
        <TrendMetric
          label={t('Payment volume')}
          value={formatCurrencyFromUSD(totals.revenue, { abbreviate: false })}
        />
        <TrendMetric
          label={t('Completed orders')}
          value={formatNumber(totals.completed)}
        />
        <TrendMetric
          label={t('Payment success rate')}
          value={new Intl.NumberFormat(
            toIntlLocale(i18n.resolvedLanguage || i18n.language),
            {
              style: 'percent',
              maximumFractionDigits: 2,
            }
          ).format(successRate)}
        />
      </div>

      {chartData.length === 0 ? (
        <div className='text-muted-foreground rounded-xl border border-dashed py-20 text-center text-sm'>
          {t('No finance trend data in the selected period.')}
        </div>
      ) : (
        <div className='grid gap-4 xl:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <CircleDollarSign className='size-4' aria-hidden='true' />
                {t('Recharge revenue trend')}
              </CardTitle>
              <CardDescription>
                {t('Daily successful external payment amount in USD.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='h-80'>
              <VChart spec={revenueSpec} option={VCHART_OPTION} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-base'>
                <ChartNoAxesCombined className='size-4' aria-hidden='true' />
                {t('Recharge order trend')}
              </CardTitle>
              <CardDescription>
                {t('Daily order outcomes grouped by payment status.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='h-80'>
              <VChart spec={orderSpec} option={VCHART_OPTION} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function TrendMetric(props: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardDescription>{props.label}</CardDescription>
      </CardHeader>
      <CardContent className='font-mono text-2xl font-semibold tabular-nums'>
        {props.value}
      </CardContent>
    </Card>
  )
}
