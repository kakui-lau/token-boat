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
      if (
        visibleModels.has(model.model_name) &&
        count >= MINIMUM_SAMPLE_COUNT
      ) {
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
          return (
            (b.measured.request_count ?? 0) - (a.measured.request_count ?? 0)
          )
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
    <section aria-labelledby='model-availability-title' className='mt-10'>
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

      <div className='grid gap-3 lg:grid-cols-2'>
        <MetricList
          title={t('Fastest models')}
          description={t(
            'Past 24 hours: output speed = total output tokens / total generation time'
          )}
          metricLabelPrimary={t('Output speed')}
          metricLabelSecondary={t('Average full response time')}
          models={fastestModels.map((d) => d.model)}
          loading={loading}
          compact={false}
          renderRow={(model, index) => {
            const data = fastestModels[index]
            return (
              <div className='flex w-full flex-col gap-1'>
                <div className='flex items-center justify-between gap-2'>
                  <span
                    className={cn(
                      'font-mono text-[13px] font-semibold tabular-nums tracking-tight text-foreground'
                    )}
                  >
                    {formatThroughput(model.avg_tps)}
                  </span>
                  <span className='text-muted-foreground font-mono text-[11px] tabular-nums'>
                    {formatLatency(model.avg_latency_ms)}
                  </span>
                </div>
                <div className='bg-muted/60 h-1 w-full overflow-hidden rounded-full'>
                  <div
                    className='h-full rounded-full bg-gradient-to-r from-sky-400 via-sky-500 to-indigo-500 transition-all duration-500'
                    style={{ width: `${(data?.tpsRatio ?? 0) * 100}%` }}
                  />
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
          compact
          loading={loading}
          renderRow={(_model, index) => {
            const row = availableModels[index]
            if (!row || row.kind === 'pending') {
              return (
                <div className='flex w-full items-center justify-between gap-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full bg-muted-foreground/25 ring-1 ring-muted/30'
                      )}
                      aria-hidden='true'
                    />
                    <span className='text-muted-foreground/70 font-mono text-[11px]'>
                      {t('No samples yet')}
                    </span>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <span className='text-muted-foreground/50 font-mono text-[11px] tabular-nums'>
                      —
                    </span>
                  </div>
                </div>
              )
            }
            const model = row.measured
            const rate = Number.isFinite(model.success_rate)
              ? model.success_rate
              : 0
            const level: SuccessRateLevel = getSuccessRateLevel(
              model.success_rate
            )
            const barColor = getSuccessRateBarClass(level)
            return (
              <div className='flex w-full items-center justify-between gap-2'>
                <div className='flex min-w-0 flex-1 items-center gap-2'>
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full transition-all',
                      getSuccessRateDotClass(model.success_rate)
                    )}
                    aria-hidden='true'
                  />
                  <span className='sr-only'>{t('Success rate')}</span>
                  <div className='bg-muted/60 h-1 min-w-0 flex-1 overflow-hidden rounded-full'>
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
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <RecentSuccessRatePoints
                    rates={model.recent_success_rates}
                    label={t('Recent observations')}
                  />
                  <span
                    className={cn(
                      'font-mono text-[12px] font-semibold tabular-nums tracking-tight',
                      getSuccessRateTextClass(model.success_rate)
                    )}
                  >
                    {formatUptimePct(model.success_rate)}
                  </span>
                  <span className='text-muted-foreground/70 font-mono text-[10px] tabular-nums'>
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
                <span className='bg-muted/60 absolute top-0 left-0 h-full w-0.5' />
              )
            }
            return (
              <span
                className={cn(
                  'absolute left-0 top-0 h-full w-0.5',
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
              ? t('{{shown}} of {{total}} configured models shown', {
                  shown: availableModels.length,
                  total: visibleModels.size,
                })
              : undefined
          }
        />
      </div>
    </section>
  )
}

function RecentSuccessRatePoints(props: { rates?: number[]; label: string }) {
  const rates = (props.rates ?? [])
    .filter((rate) => Number.isFinite(rate))
    .slice(-3)

  if (rates.length === 0) {
    return null
  }

  const observations = rates.map((rate, index) => ({
    position: index + 1,
    rate,
    formattedRate: formatUptimePct(rate),
  }))

  return (
    <div
      role='img'
      aria-label={`${props.label}: ${observations.map((observation) => observation.formattedRate).join(', ')}`}
      className='flex h-3 items-end gap-0.5'
    >
      {observations.map((observation) => (
        <span
          key={observation.position}
          title={`${props.label} ${observation.position}: ${observation.formattedRate}`}
          className={cn(
            'h-3 w-1.5 rounded-sm ring-1 ring-background/70',
            getSuccessRateDotClass(observation.rate)
          )}
          aria-hidden='true'
        />
      ))}
    </div>
  )
}

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

function rankStyles(rank: number): { badge: string; text: string } {
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
    badge: 'bg-muted/70 text-muted-foreground border border-muted',
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
  compact: boolean
  renderRow: (model: PerfModelSummary, index: number) => React.ReactNode
  rowLeadingBar?: (model: PerfModelSummary, index: number) => React.ReactNode
  rowLabel?: (model: PerfModelSummary, index: number) => string | undefined
  footerHint?: string
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
      <ul
        className={cn(
          'relative divide-y divide-border/60',
          props.compact && 'divide-border/50'
        )}
      >
        {props.models.map((model, index) => {
          const rank = index + 1
          const style = rankStyles(rank)
          const label = props.rowLabel?.(model, index) ?? model.model_name
          const compact = props.compact
          return (
            <li
              key={label}
              className={cn(
                'relative flex items-stretch transition-colors hover:bg-muted/30',
                compact
                  ? 'min-h-[40px] gap-2.5 px-4 py-1.5'
                  : 'min-h-[64px] gap-4 px-4 py-2.5'
              )}
            >
              {props.rowLeadingBar?.(model, index)}
              {!compact ? (
                <div className='flex flex-col items-center justify-start pt-0.5'>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-md text-[10px] font-bold tabular-nums',
                      style.badge
                    )}
                  >
                    {rank}
                  </span>
                </div>
              ) : (
                <div className='flex w-5 shrink-0 flex-col items-center justify-center'>
                  <span
                    className={cn(
                      'font-mono text-[10px] font-semibold tabular-nums leading-none',
                      style.text
                    )}
                  >
                    {rank <= 99 ? rank : '•'}
                  </span>
                </div>
              )}
              <div className='flex min-w-0 flex-1 flex-col justify-center gap-0.5'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className={cn(
                      'min-w-0 truncate font-mono tracking-tight text-foreground',
                      compact
                        ? 'text-[12px] font-medium'
                        : 'text-[13px] font-medium'
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
      <div className='via-border pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent opacity-70' />
      <header className='relative border-b px-4 py-3'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='text-foreground text-[14px] font-semibold tracking-tight'>
              {props.title}
            </h3>
            <p className='text-muted-foreground mt-0.5 text-[11px] leading-snug'>
              {props.description}
            </p>
          </div>
        </div>
      </header>
      <div className='relative flex-1'>{content}</div>
      {props.footerHint && (
        <div className='border-t px-4 py-1.5'>
          <p className='text-muted-foreground font-mono text-[10px]'>
            {props.footerHint}
          </p>
        </div>
      )}
    </article>
  )
}
