/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

const MINIMUM_SAMPLE_COUNT = 10
const LIST_LIMIT = 8

type ModelAvailabilityOverviewProps = {
  modelNames: string[]
}

export function ModelAvailabilityOverview(
  props: ModelAvailabilityOverviewProps
) {
  const { t } = useTranslation()
  const [dailyQuery, threeDayQuery] = useQueries({
    queries: [
      {
        queryKey: ['perf-metrics-summary', 24],
        queryFn: () => getPerfMetricsSummary(24),
        staleTime: 60 * 1000,
        retry: false,
      },
      {
        queryKey: ['perf-metrics-summary', 72],
        queryFn: () => getPerfMetricsSummary(72),
        staleTime: 60 * 1000,
        retry: false,
      },
    ],
  })

  const visibleModels = useMemo(
    () => new Set(props.modelNames),
    [props.modelNames]
  )
  const fastestModels = useMemo(
    () =>
      filterMeasuredModels(dailyQuery.data?.data.models ?? [], visibleModels)
        .filter((model) => model.avg_tps > 0)
        .sort((a, b) => b.avg_tps - a.avg_tps)
        .slice(0, LIST_LIMIT),
    [dailyQuery.data, visibleModels]
  )
  const availableModels = useMemo(
    () =>
      filterMeasuredModels(threeDayQuery.data?.data.models ?? [], visibleModels)
        .sort((a, b) => (b.request_count ?? 0) - (a.request_count ?? 0))
        .slice(0, LIST_LIMIT),
    [threeDayQuery.data, visibleModels]
  )
  const loading = dailyQuery.isLoading || threeDayQuery.isLoading

  return (
    <section aria-labelledby='model-availability-title' className='mt-10'>
      <div className='mb-4'>
        <h2 id='model-availability-title' className='text-xl font-semibold'>
          {t('Model availability')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t(
            'Based on recent platform requests and configured text-model probes; this is historical data, not a real-time guarantee.'
          )}
        </p>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <MetricList
          title={t('Fastest models')}
          description={t(
            'Past 24 hours: output speed = total output tokens / total generation time'
          )}
          models={fastestModels}
          loading={loading}
          renderMetric={(model) => (
            <div className='text-right'>
              <div className='font-mono text-sm font-semibold tabular-nums'>
                {formatThroughput(model.avg_tps)}
              </div>
              <div className='text-muted-foreground text-[11px]'>
                {t('Output speed')}
              </div>
              <div className='text-muted-foreground text-xs'>
                {formatLatency(model.avg_latency_ms)} ·{' '}
                {t('Average full response time')}
              </div>
            </div>
          )}
        />
        <MetricList
          title={t('Model success rate')}
          description={t('Observed success rate over the past 72 hours')}
          models={availableModels}
          loading={loading}
          renderMetric={(model) => (
            <div className='flex items-center gap-2'>
              <span
                className={cn(
                  'size-2 rounded-full',
                  getSuccessRateDotClass(model.success_rate)
                )}
                aria-hidden='true'
              />
              <span
                className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  getSuccessRateTextClass(model.success_rate)
                )}
              >
                {formatUptimePct(model.success_rate)}
              </span>
            </div>
          )}
        />
      </div>
    </section>
  )
}

function filterMeasuredModels(
  models: PerfModelSummary[],
  visibleModels: Set<string>
): PerfModelSummary[] {
  return models.filter(
    (model) =>
      visibleModels.has(model.model_name) &&
      (model.request_count ?? 0) >= MINIMUM_SAMPLE_COUNT
  )
}

function MetricList(props: {
  title: string
  description: string
  models: PerfModelSummary[]
  loading: boolean
  renderMetric: (model: PerfModelSummary) => React.ReactNode
}) {
  const { t } = useTranslation()
  let content: React.ReactNode

  if (props.loading) {
    content = (
      <div className='text-muted-foreground px-4 py-8 text-center text-sm'>
        {t('Loading...')}
      </div>
    )
  } else if (props.models.length === 0) {
    content = (
      <div className='text-muted-foreground px-4 py-8 text-center text-sm'>
        {t('Not enough recent samples')}
      </div>
    )
  } else {
    content = (
      <ol className='divide-y'>
        {props.models.map((model, index) => (
          <li
            key={model.model_name}
            className='flex min-h-14 items-center gap-3 px-4 py-2.5'
          >
            <span className='text-muted-foreground w-5 text-center font-mono text-xs'>
              {index + 1}
            </span>
            <span className='min-w-0 flex-1 truncate font-mono text-sm'>
              {model.model_name}
            </span>
            {props.renderMetric(model)}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <article className='bg-background/70 overflow-hidden rounded-xl border backdrop-blur-sm'>
      <header className='border-b px-4 py-3'>
        <h3 className='font-semibold'>{props.title}</h3>
        <p className='text-muted-foreground mt-0.5 text-xs'>
          {props.description}
        </p>
      </header>
      {content}
    </article>
  )
}
