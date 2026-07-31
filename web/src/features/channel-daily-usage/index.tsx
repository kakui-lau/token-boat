/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  Download,
  FileWarning,
  Lock,
  RefreshCw,
  Unlock,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ComboboxInput } from '@/components/ui/combobox-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleServerError } from '@/lib/handle-server-error'

import {
  exportChannelDailyUsages,
  getChannelDailyUsageFilterOptions,
  getChannelDailyUsages,
  getChannelDailyUsageMonth,
  getChannelDailyUsageSummary,
  lockChannelDailyUsageMonth,
  recalculateChannelDailyUsages,
  unlockChannelDailyUsageMonth,
} from './api'
import { getDefaultUtcWeekRange, getUtcMonthRange } from './lib/date-range'
import type { ChannelDailyUsageFilters } from './types'

const PAGE_SIZE = 50

type PendingAction = 'recalculate' | 'lock' | 'unlock' | null

function formatInteger(value: number | undefined): string {
  return new Intl.NumberFormat().format(value ?? 0)
}

function formatUsd(value: string | undefined): string {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 6,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function previousUtcMonth(): string {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() - 1)
  return date.toISOString().slice(0, 7)
}

export function ChannelDailyUsagePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [defaultDateRange] = useState(getDefaultUtcWeekRange)
  const [startDate, setStartDate] = useState(defaultDateRange.start_date)
  const [endDate, setEndDate] = useState(defaultDateRange.end_date)
  const [granularity, setGranularity] = useState<'day' | 'month'>('day')
  const [channelId, setChannelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [upstreamModel, setUpstreamModel] = useState('')
  const [status, setStatus] = useState<'all' | 'open' | 'locked'>('all')
  const [settlementMonth, setSettlementMonth] = useState(previousUtcMonth)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [page, setPage] = useState(1)
  const startMonth = startDate.slice(0, 7)
  const endMonth = endDate.slice(0, 7)

  const filters = useMemo<ChannelDailyUsageFilters>(
    () => ({
      start_date: startDate,
      end_date: endDate,
      granularity,
      channel_id: channelId ? Number(channelId) : undefined,
      model_name: modelName.trim() || undefined,
      upstream_model: upstreamModel.trim() || undefined,
      status: status === 'all' ? undefined : status,
      page,
      page_size: PAGE_SIZE,
    }),
    [
      channelId,
      endDate,
      granularity,
      modelName,
      page,
      startDate,
      status,
      upstreamModel,
    ]
  )

  const usageQuery = useQuery({
    queryKey: ['channel-daily-usages', filters],
    queryFn: () => getChannelDailyUsages(filters),
  })
  const summaryQuery = useQuery({
    queryKey: ['channel-daily-usages-summary', filters],
    queryFn: () =>
      getChannelDailyUsageSummary({ ...filters, page: 1, page_size: 1 }),
  })
  const filterOptionsQuery = useQuery({
    queryKey: ['channel-daily-usage-filter-options', startDate, endDate],
    queryFn: () =>
      getChannelDailyUsageFilterOptions({
        start_date: startDate,
        end_date: endDate,
      }),
  })
  const settlementQuery = useQuery({
    queryKey: ['channel-daily-usage-month', settlementMonth],
    queryFn: () => getChannelDailyUsageMonth(settlementMonth),
    enabled: Boolean(settlementMonth),
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['channel-daily-usages'] }),
      queryClient.invalidateQueries({
        queryKey: ['channel-daily-usages-summary'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['channel-daily-usage-month'],
      }),
    ])
  }
  const recalculateMutation = useMutation({
    mutationFn: recalculateChannelDailyUsages,
    onSuccess: async () => {
      setPendingAction(null)
      await invalidate()
      toast.success(t('Daily usage recalculation completed'))
    },
    onError: handleServerError,
  })
  const lockMutation = useMutation({
    mutationFn: lockChannelDailyUsageMonth,
    onSuccess: async () => {
      setPendingAction(null)
      await invalidate()
      toast.success(t('Usage month locked'))
    },
    onError: handleServerError,
  })
  const unlockMutation = useMutation({
    mutationFn: unlockChannelDailyUsageMonth,
    onSuccess: async () => {
      setPendingAction(null)
      await invalidate()
      toast.success(t('Usage month unlocked'))
    },
    onError: handleServerError,
  })

  const summary = summaryQuery.data?.data
  const rows = usageQuery.data?.data?.items ?? []
  const total = usageQuery.data?.data?.total ?? 0
  const settlement = settlementQuery.data?.data
  const filterOptions = filterOptionsQuery.data?.data
  const channelOptions = useMemo(
    () => [
      { value: '', label: t('All Channels') },
      ...(filterOptions?.channels ?? []).map((channel) => ({
        value: String(channel.channel_id),
        label: channel.channel_name
          ? `${channel.channel_name} (#${channel.channel_id})`
          : `#${channel.channel_id}`,
      })),
    ],
    [filterOptions?.channels, t]
  )
  const modelOptions = useMemo(
    () => [
      { value: '', label: t('All platform models') },
      ...(filterOptions?.model_names ?? []).map((model) => ({
        value: model,
        label: model,
      })),
    ],
    [filterOptions?.model_names, t]
  )
  const upstreamModelOptions = useMemo(
    () => [
      { value: '', label: t('All upstream models') },
      ...(filterOptions?.upstream_models ?? []).map((model) => ({
        value: model,
        label: model,
      })),
    ],
    [filterOptions?.upstream_models, t]
  )
  const isLocked = settlement?.status === 'locked'
  const busy =
    recalculateMutation.isPending ||
    lockMutation.isPending ||
    unlockMutation.isPending
  const settlementRange = getUtcMonthRange(`${settlementMonth}-01`)

  const handleExport = async () => {
    try {
      const blob = await exportChannelDailyUsages(filters)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `channel-${granularity}-usage-${startDate}-${endDate}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      handleServerError(error)
    }
  }

  const runPendingAction = () => {
    if (pendingAction === 'recalculate') {
      recalculateMutation.mutate({
        ...settlementRange,
        timezone: 'UTC',
      })
    } else if (pendingAction === 'lock') {
      lockMutation.mutate({ month: settlementMonth })
    } else if (pendingAction === 'unlock') {
      unlockMutation.mutate({ month: settlementMonth })
    }
  }

  const dialogCopy = {
    recalculate: {
      title: t('Recalculate UTC month'),
      description: t(
        'This rebuilds every daily usage row in {{month}} from immutable consumption logs. Existing unlocked aggregates will be replaced.',
        { month: settlementMonth }
      ),
      confirm: t('Recalculate month'),
      destructive: false,
    },
    lock: {
      title: t('Lock UTC accounting month'),
      description: t(
        'After locking {{month}}, scheduled and manual recalculation cannot change any day in this month, including days with no usage.',
        { month: settlementMonth }
      ),
      confirm: t('Lock and close month'),
      destructive: false,
    },
    unlock: {
      title: t('Unlock UTC accounting month'),
      description: t(
        'Unlocking {{month}} allows its daily aggregates to be recalculated again. Use this only when correcting reconciliation data.',
        { month: settlementMonth }
      ),
      confirm: t('Unlock month'),
      destructive: true,
    },
  } as const
  const activeDialog = pendingAction ? dialogCopy[pendingAction] : null

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Channel Daily Usage')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button variant='outline' onClick={handleExport}>
            <Download data-icon='inline-start' />
            {t('Export filtered CSV')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-5'>
            <Card className='border-primary/20 bg-primary/5'>
              <CardHeader>
                <CardTitle>{t('UTC reconciliation report')}</CardTitle>
                <CardDescription>
                  {t(
                    granularity === 'month'
                      ? 'Each row summarizes one channel and model for a UTC month. Requests are counted from daily reconciliation data.'
                      : 'Each row summarizes one channel and model for a completed UTC day. Requests are counted from consumption logs, not upstream retry attempts.'
                  )}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className='relative z-10 overflow-visible'>
              <CardHeader>
                <CardTitle>{t('Report filters')}</CardTitle>
                <CardDescription>
                  {t(
                    'Filter the report for investigation or export. Changing filters does not modify accounting data.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2 xl:grid-cols-7'>
                <div className='grid gap-1.5'>
                  <Label>{t('Aggregation')}</Label>
                  <Select
                    items={[
                      { value: 'day', label: t('Daily') },
                      { value: 'month', label: t('Monthly') },
                    ]}
                    value={granularity}
                    onValueChange={(value) => {
                      if (value) {
                        const nextGranularity = value as typeof granularity
                        setGranularity(nextGranularity)
                        if (nextGranularity === 'month') {
                          const previousMonth = previousUtcMonth()
                          const range = getUtcMonthRange(`${previousMonth}-01`)
                          setStartDate(range.start_date)
                          setEndDate(range.end_date)
                        }
                        setPage(1)
                      }
                    }}
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Aggregation')}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='day'>{t('Daily')}</SelectItem>
                        <SelectItem value='month'>{t('Monthly')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='usage-start-date'>
                    {granularity === 'month'
                      ? t('Start Month')
                      : t('Start Date')}
                  </Label>
                  <Input
                    id='usage-start-date'
                    type={granularity === 'month' ? 'month' : 'date'}
                    value={granularity === 'month' ? startMonth : startDate}
                    onChange={(event) => {
                      setStartDate(
                        granularity === 'month'
                          ? `${event.target.value}-01`
                          : event.target.value
                      )
                      setPage(1)
                    }}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='usage-end-date'>
                    {granularity === 'month' ? t('End Month') : t('End Date')}
                  </Label>
                  <Input
                    id='usage-end-date'
                    type={granularity === 'month' ? 'month' : 'date'}
                    value={granularity === 'month' ? endMonth : endDate}
                    onChange={(event) => {
                      setEndDate(
                        granularity === 'month'
                          ? getUtcMonthRange(`${event.target.value}-01`)
                              .end_date
                          : event.target.value
                      )
                      setPage(1)
                    }}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='usage-channel-id'>{t('Channel')}</Label>
                  <ComboboxInput
                    id='usage-channel-id'
                    options={channelOptions}
                    value={channelId}
                    placeholder={t('All Channels')}
                    onValueChange={(value) => {
                      setChannelId(value)
                      setPage(1)
                    }}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='usage-model'>{t('Platform Model')}</Label>
                  <ComboboxInput
                    id='usage-model'
                    options={modelOptions}
                    value={modelName}
                    placeholder={t('All platform models')}
                    onValueChange={(value) => {
                      setModelName(value)
                      setPage(1)
                    }}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='usage-upstream-model'>
                    {t('Upstream Model')}
                  </Label>
                  <ComboboxInput
                    id='usage-upstream-model'
                    options={upstreamModelOptions}
                    value={upstreamModel}
                    placeholder={t('All upstream models')}
                    onValueChange={(value) => {
                      setUpstreamModel(value)
                      setPage(1)
                    }}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label>{t('Settlement Status')}</Label>
                  <Select
                    items={[
                      { value: 'all', label: t('All statuses') },
                      { value: 'open', label: t('Open') },
                      { value: 'locked', label: t('Locked') },
                    ]}
                    value={status}
                    onValueChange={(value) => {
                      if (value) {
                        setStatus(value as typeof status)
                        setPage(1)
                      }
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='all'>{t('All statuses')}</SelectItem>
                        <SelectItem value='open'>{t('Open')}</SelectItem>
                        <SelectItem value='locked'>{t('Locked')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Monthly reconciliation')}</CardTitle>
                <CardDescription>
                  {t(
                    'Recalculate a complete UTC month before comparing the report with an upstream statement, then lock it after reconciliation is approved.'
                  )}
                </CardDescription>
                <CardAction>
                  <Badge variant={isLocked ? 'default' : 'secondary'}>
                    {isLocked ? t('Locked') : t('Open')}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className='flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
                <div className='grid gap-1.5'>
                  <Label htmlFor='settlement-month'>{t('UTC Month')}</Label>
                  <Input
                    id='settlement-month'
                    type='month'
                    max={previousUtcMonth()}
                    value={settlementMonth}
                    onChange={(event) => setSettlementMonth(event.target.value)}
                    className='w-full sm:w-52'
                  />
                  <p className='text-muted-foreground text-xs'>
                    {isLocked && settlement?.locked_at
                      ? t('Locked at {{time}} by administrator #{{id}}', {
                          time: new Date(
                            settlement.locked_at * 1000
                          ).toLocaleString(),
                          id: settlement.locked_by,
                        })
                      : t('This month is open and may be recalculated.')}
                  </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    variant='outline'
                    disabled={busy || isLocked || !settlementMonth}
                    onClick={() => setPendingAction('recalculate')}
                  >
                    <RefreshCw data-icon='inline-start' />
                    {t('Recalculate month')}
                  </Button>
                  <Button
                    disabled={busy || isLocked || !settlementMonth}
                    onClick={() => setPendingAction('lock')}
                  >
                    <Lock data-icon='inline-start' />
                    {t('Lock and close month')}
                  </Button>
                  <Button
                    variant='outline'
                    disabled={busy || !isLocked || !settlementMonth}
                    onClick={() => setPendingAction('unlock')}
                  >
                    <Unlock data-icon='inline-start' />
                    {t('Unlock month')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Billed Requests')}</CardTitle>
                  <CardAction>
                    <CalendarClock className='text-muted-foreground size-4' />
                  </CardAction>
                </CardHeader>
                <CardContent className='text-2xl font-semibold'>
                  {formatInteger(summary?.billed_request_count)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Total Tokens')}</CardTitle>
                </CardHeader>
                <CardContent className='text-2xl font-semibold'>
                  {formatInteger(summary?.total_tokens)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Billed Amount')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-semibold'>
                    {formatUsd(summary?.customer_revenue_usd)}
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t(
                      'Billed quota converted to USD; this is not cash received or net profit.'
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Data Exceptions')}</CardTitle>
                  <CardAction>
                    <FileWarning className='text-muted-foreground size-4' />
                  </CardAction>
                </CardHeader>
                <CardContent className='text-2xl font-semibold'>
                  {formatInteger(
                    (summary?.missing_usage_count ?? 0) +
                      (summary?.pending_task_count ?? 0) +
                      (summary?.manual_review_count ?? 0)
                  )}
                </CardContent>
              </Card>
            </div>

            <div className='overflow-hidden rounded-lg border'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        {granularity === 'month'
                          ? t('UTC Month')
                          : t('UTC Date')}
                      </TableHead>
                      <TableHead>{t('Channel')}</TableHead>
                      <TableHead>{t('Platform Model')}</TableHead>
                      <TableHead>{t('Upstream Model')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Billed Requests')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Input Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Cached Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Output Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Total Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Billed Amount')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Exceptions')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={
                          granularity === 'month'
                            ? `${row.usage_date}:${row.channel_id}:${row.model_name}:${row.upstream_model}:${row.status}`
                            : row.id
                        }
                      >
                        <TableCell>{row.usage_date}</TableCell>
                        <TableCell>
                          {row.channel_name || `#${row.channel_id}`}
                        </TableCell>
                        <TableCell>{row.model_name}</TableCell>
                        <TableCell>{row.upstream_model}</TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.billed_request_count)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.prompt_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.cache_read_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.completion_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.total_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatUsd(row.customer_revenue_usd)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(
                            row.missing_usage_count +
                              row.pending_task_count +
                              row.manual_review_count
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!usageQuery.isLoading && rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={11}
                          className='text-muted-foreground h-24 text-center'
                        >
                          {granularity === 'month'
                            ? t('No monthly usage data found')
                            : t('No daily usage data found')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {summary && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4}>{t('Total')}</TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.billed_request_count)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.prompt_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.cache_read_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.completion_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.total_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatUsd(summary.customer_revenue_usd)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(
                            summary.missing_usage_count +
                              summary.pending_task_count +
                              summary.manual_review_count
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              <div className='flex items-center justify-between border-t p-3 text-sm'>
                <span>{t('{{count}} records', { count: total })}</span>
                <div className='flex gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    {t('Previous')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page * PAGE_SIZE >= total}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t('Next')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={activeDialog?.title}
        desc={activeDialog?.description ?? ''}
        confirmText={activeDialog?.confirm}
        destructive={activeDialog?.destructive}
        isLoading={busy}
        handleConfirm={runPendingAction}
      />
    </>
  )
}
