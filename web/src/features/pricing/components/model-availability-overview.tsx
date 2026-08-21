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
  getSuccessRateColor,
  getSuccessRateDotClass,
  getSuccessRateLevel,
  getSuccessRateTextClass,
  type SuccessRateLevel,
} from '@/features/performance-metrics/lib/format'
import type { PerfModelSummary } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

const MINIMUM_SAMPLE_COUNT = 1
const FASTEST_LIST_LIMIT = 8
const SUCCESS_RATE_LIST_LIMIT_MAX = 64

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
  const measuredMap72h = useMemo(() => {
    const m = new Map<string, PerfModelSummary>()
    for (const model of threeDayQuery.data?.data.models ?? []) {
      const count = model.request_count ?? 0
      if (visibleModels.has(model.model_name) && count >= MINIMUM_SAMPLE_COUNT) {
        m.set(model.model_name, model)
      }
    }
    return m
  }, [threeDayQuery.data, visibleModels])
  const fastestModels = useMemo(() => {
    const list = (dailyQuery.data?.data.models ?? [])
      .filter(
        (m) =>
          visibleModels.has(m.model_name) &&
          (m.request_count ?? 0) >= MINIMUM_SAMPLE_COUNT &&
          m.avg_tps > 0
      )
      .sort((a, b) => b.avg_tps - a.avg_tps)
      .slice(0, FASTEST_LIST_LIMIT)
    const maxTps = list[0]?.avg_tps ?? 1
    return list.map((m) => ({
      model: m,
      tpsRatio: Math.min(1, Math.max(0, m.avg_tps / maxTps)),
    }))
  }, [dailyQuery.data, visibleModels])
  const availableModels = useMemo(() => {
    const ordered = [...visibleModels]
      .map((name) => {
        const measured = measuredMap72h.get(name)
        if (measured) {
          return { kind: 'measured' as const, name, measured }
        }
        return { kind: 'pending' as const, name }
      })
      .sort((a, b) => {
        if (a.kind === 'measured' && b.kind === 'measured') {
          return (b.measured.request_count ?? 0) - (a.measured.request_count ?? 0)
        }
        if (a.kind === 'measured') return -1
        if (b.kind === 'measured') return 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, SUCCESS_RATE_LIST_LIMIT_MAX)
    return ordered
  }, [visibleModels, measuredMap72h])
  const loading = dailyQuery.isLoading || threeDayQuery.isLoading

  return (
    <section
      aria-labelledby='model-availability-title'
      className='mt-10'
    >
      <div className='mb-4'>
        <h2
          id='model-availability-title'
          className='text-xl font-semibold tracking-tight'
        >
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
          metricLabelPrimary={t('Output speed')}
          metricLabelSecondary={t('Average full response time')}
          models={fastestModels.map((d) => d.model)}
          loading={loading}
          renderRow={(model, index) => {
            const data = fastestModels[index]
            return (
              <div className='flex w-full flex-col gap-1.5'>
                <div className='flex items-baseline justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-xs font-medium text-muted-foreground/80'>
                      {t('Output speed')}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-base font-semibold tabular-nums tracking-tight text-foreground'
                    )}
                  >
                    {formatThroughput(model.avg_tps)}
                  </span>
                </div>
                <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted/60'>
                  <div
                    className='h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 transition-all duration-500'
                    style={{ width: `${(data?.tpsRatio ?? 0) * 100}%` }}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-mono text-[11px] text-muted-foreground'>
                    {t('Average full response time')}
                  </span>
                  <span className='font-mono text-[11px] tabular-nums text-muted-foreground'>
                    {formatLatency(model.avg_latency_ms)}
                  </span>
                </div>
              </div>
            )
          }}
        />
        <MetricList
          title={t('Model success rate')}
          description={t('Observed success rate over the past 72 hours')}
          metricLabelPrimary={t('Success rate')}
          metricLabelSecondary={t('Observed window')}
          models={availableModels.map((d) =>
            d.kind === 'measured'
              ? d.measured
              : ({
                  model_name: d.name,
                  avg_latency_ms: 0,
                  success_rate: 0,
                  avg_tps: 0,
                  request_count: 0,
                } satisfies PerfModelSummary)
          )}
          loading={loading}
          renderRow={(_model, index) => {
            const row = availableModels[index]
            if (!row || row.kind === 'pending') {
              return (
                <div className='flex w-full flex-col gap-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex items-center gap-2'>
                      <span
                        className={cn(
                          'size-2 rounded-full ring-2 ring-offset-background bg-muted-foreground/25 ring-muted/20'
                        )}
                        aria-hidden='true'
                      />
                      <span className='font-mono text-xs font-medium text-muted-foreground/70'>
                        {t('No samples yet')}
                      </span>
                    </div>
                    <span className='font-mono text-sm tabular-nums text-muted-foreground/50'>
                      —
                    </span>
                  </div>
                  <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted/40'>
                    <div className='h-full w-0 rounded-full bg-muted-foreground/15' />
                  </div>
                  <div className='flex items-center justify-between gap-2'>
                    <span className='font-mono text-[11px] text-muted-foreground/60'>
                      {t('No samples yet')}
                    </span>
                    <span className='font-mono text-[11px] tabular-nums text-muted-foreground/50'>
                      0
                    </span>
                  </div>
                </div>
              )
            }
            const model = row.measured
            const rate = Number.isFinite(model.success_rate)
              ? model.success_rate
              : 0
            const level: SuccessRateLevel = getSuccessRateLevel(model.success_rate)
            const barColor = getSuccessRateBarClass(level)
            return (
              <div className='flex w-full flex-col gap-1.5'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='flex items-center gap-2'>
                    <span
                      className={cn(
                        'size-2 rounded-full ring-2 ring-offset-background transition-all',
                        getSuccessRateDotClass(model.success_rate),
                        level === 'excellent' &&
                          'ring-emerald-500/10 dark:ring-emerald-500/20',
                        level === 'good' &&
                          'ring-emerald-400/10 dark:ring-emerald-400/20',
                        level === 'warning' &&
                          'ring-amber-500/10 dark:ring-amber-500/20',
                        level === 'critical' &&
                          'ring-red-500/10 dark:ring-red-500/20'
                      )}
                      aria-hidden='true'
                    />
                    <span className='font-mono text-xs font-medium text-muted-foreground/80'>
                      {t('Success rate')}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-base font-semibold tabular-nums tracking-tight',
                      getSuccessRateTextClass(model.success_rate)
                    )}
                  >
                    {formatUptimePct(model.success_rate)}
                  </span>
                </div>
                <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted/60'>
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      barColor
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(100, rate))}%`,
                      backgroundColor:
                        barColor === ''
                          ? getSuccessRateColor(model.success_rate)
                          : undefined,
                    }}
                  />
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <span className='font-mono text-[11px] text-muted-foreground'>
                    {t('72h samples')}
                  </span>
                  <span className='font-mono text-[11px] tabular-nums text-muted-foreground'>
                    {model.request_count?.toLocaleString() ?? '—'}
                  </span>
                </div>
              </div>
            )
          }}
          rowLeadingBar={(_model, index) => {
            const row = availableModels[index]
            if (!row || row.kind === 'pending') {
              return (
                <span className='absolute left-0 top-0 h-full w-1 bg-muted/60' />
              )
            }
            return (
              <span
                className={cn(
                  'absolute left-0 top-0 h-full w-1',
                  getSuccessRateStripeClass(
                    getSuccessRateLevel(row.measured.success_rate)
                  )
                )}
              />
            )
          }}
          rowLabel={(_model, index) => {
            const row = availableModels[index]
            return row ? row.name : undefined
          }}
          footerHint={
            !loading
              ? t(
                  '{{shown}} of {{total}} configured models shown',
                  {
                    shown: availableModels.length,
                    total: visibleModels.size,
                  }
                )
              : undefined
          }
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
void filterMeasuredModels

function getSuccessRateBarClass(level: SuccessRateLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-gradient-to-r from-emerald-400 to-emerald-500'
    case 'good':
      return 'bg-gradient-to-r from-emerald-300 to-emerald-500'
    case 'warning':
      return 'bg-gradient-to-r from-amber-400 to-amber-500'
    case 'critical':
      return 'bg-gradient-to-r from-red-400 to-red-500'
    default:
      return 'bg-muted-foreground/40'
  }
}

function getSuccessRateStripeClass(level: SuccessRateLevel): string {
  switch (level) {
    case 'excellent':
      return 'bg-emerald-500/80'
    case 'good':
      return 'bg-emerald-400/80'
    case 'warning':
      return 'bg-amber-500/80'
    case 'critical':
      return 'bg-red-500/80'
    default:
      return 'bg-muted/80'
  }
}

function rankStyles(
  rank: number
): { badge: string; text: string } {
  if (rank === 1) {
    return {
      badge:
        'bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-amber-950 shadow-[0_0_0_1px_rgba(251,191,36,0.3)]',
      text: 'text-amber-600 dark:text-amber-400',
    }
  }
  if (rank === 2) {
    return {
      badge:
        'bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500 text-slate-900 shadow-[0_0_0_1px_rgba(148,163,184,0.25)]',
      text: 'text-slate-500 dark:text-slate-300',
    }
  }
  if (rank === 3) {
    return {
      badge:
        'bg-gradient-to-br from-orange-300 via-orange-400 to-orange-600 text-orange-950 shadow-[0_0_0_1px_rgba(251,146,60,0.3)]',
      text: 'text-orange-600 dark:text-orange-400',
    }
  }
  return {
    badge:
      'bg-muted/70 text-muted-foreground border border-muted',
    text: 'text-muted-foreground/80',
  }
}

function MetricList(props: {
  title: string
  description: string
  metricLabelPrimary?: string
  metricLabelSecondary?: string
  models: PerfModelSummary[]
  loading: boolean
  renderRow: (model: PerfModelSummary, index: number) => React.ReactNode
  rowLeadingBar?: (model: PerfModelSummary, index: number) => React.ReactNode
  rowLabel?: (model: PerfModelSummary, index: number) => string | undefined
  footerHint?: string
}) {
  const { t } = useTranslation()
  let content: React.ReactNode

  if (props.loading) {
    content = (
      <div className='text-muted-foreground px-5 py-10 text-center text-sm'>
        {t('Loading...')}
      </div>
    )
  } else if (props.models.length === 0) {
    content = (
      <div className='text-muted-foreground px-5 py-10 text-center text-sm'>
        {t('Not enough recent samples')}
      </div>
    )
  } else {
    content = (
      <ul className='relative divide-y divide-border/70'>
        {props.models.map((model, index) => {
          const rank = index + 1
          const style = rankStyles(rank)
          const label = props.rowLabel?.(model, index) ?? model.model_name
          return (
            <li
              key={label}
              className={cn(
                'relative flex min-h-[84px] items-stretch gap-4 px-5 py-4 transition-colors hover:bg-muted/35'
              )}
            >
              {props.rowLeadingBar?.(model, index)}
              <div className='flex flex-col items-center justify-start pt-0.5'>
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums',
                    style.badge
                  )}
                >
                  {rank}
                </span>
              </div>
              <div className='flex min-w-0 flex-1 flex-col justify-between gap-1'>
                <div className='flex items-center gap-2'>
                  <span
                    className={cn(
                      'min-w-0 truncate font-mono text-[13px] font-medium tracking-tight text-foreground'
                    )}
                    title={label}
                  >
                    {label}
                  </span>
                </div>
                {props.renderRow(model, index)}
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border shadow-[0_1px_0_0_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)] dark:hover:shadow-[0_8px_28px_-16px_rgba(0,0,0,0.6)]',
        'bg-gradient-to-b from-background/90 via-background/70 to-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50'
      )}
    >
      <div className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-70' />
      <header className='relative border-b px-5 py-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='text-[15px] font-semibold tracking-tight text-foreground'>
              {props.title}
            </h3>
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {props.description}
            </p>
          </div>
        </div>
      </header>
      <div className='relative flex-1'>{content}</div>
      {props.footerHint && (
        <div className='border-t px-5 py-2'>
          <p className='text-muted-foreground font-mono text-[11px]'>
            {props.footerHint}
          </p>
        </div>
      )}
    </article>
  )
}
