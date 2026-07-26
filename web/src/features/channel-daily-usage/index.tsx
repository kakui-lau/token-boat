/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Lock, RefreshCw, Unlock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleServerError } from '@/lib/handle-server-error'

import {
  exportChannelDailyUsages,
  getChannelDailyUsages,
  getChannelDailyUsageSummary,
  lockChannelDailyUsageMonth,
  recalculateChannelDailyUsages,
  unlockChannelDailyUsageMonth,
} from './api'
import { getUtcDate, getUtcMonthRange } from './lib/date-range'
import type { ChannelDailyUsageFilters } from './types'

const PAGE_SIZE = 50

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

export function ChannelDailyUsagePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [startDate, setStartDate] = useState(() => getUtcDate(-7))
  const [endDate, setEndDate] = useState(() => getUtcDate(-1))
  const [channelId, setChannelId] = useState('')
  const [modelName, setModelName] = useState('')
  const [page, setPage] = useState(1)

  const filters = useMemo<ChannelDailyUsageFilters>(
    () => ({
      start_date: startDate,
      end_date: endDate,
      channel_id: channelId ? Number(channelId) : undefined,
      model_name: modelName.trim() || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [channelId, endDate, modelName, page, startDate]
  )

  const usageQuery = useQuery({
    queryKey: ['channel-daily-usages', filters],
    queryFn: () => getChannelDailyUsages(filters),
  })
  const summaryQuery = useQuery({
    queryKey: [
      'channel-daily-usages-summary',
      startDate,
      endDate,
      channelId,
      modelName,
    ],
    queryFn: () =>
      getChannelDailyUsageSummary({ ...filters, page: 1, page_size: 1 }),
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['channel-daily-usages'] }),
      queryClient.invalidateQueries({
        queryKey: ['channel-daily-usages-summary'],
      }),
    ])
  }
  const recalculateMutation = useMutation({
    mutationFn: recalculateChannelDailyUsages,
    onSuccess: async () => {
      await invalidate()
      toast.success(t('Daily usage recalculation completed'))
    },
    onError: handleServerError,
  })
  const lockMutation = useMutation({
    mutationFn: lockChannelDailyUsageMonth,
    onSuccess: async () => {
      await invalidate()
      toast.success(t('Usage month locked'))
    },
    onError: handleServerError,
  })
  const unlockMutation = useMutation({
    mutationFn: unlockChannelDailyUsageMonth,
    onSuccess: async () => {
      await invalidate()
      toast.success(t('Usage month unlocked'))
    },
    onError: handleServerError,
  })

  const summary = summaryQuery.data?.data
  const rows = usageQuery.data?.data?.items ?? []
  const total = usageQuery.data?.data?.total ?? 0
  const monthRange = getUtcMonthRange(startDate)
  const busy =
    recalculateMutation.isPending ||
    lockMutation.isPending ||
    unlockMutation.isPending

  const handleExport = async () => {
    try {
      const blob = await exportChannelDailyUsages(filters)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `channel-daily-usage-${startDate}-${endDate}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      handleServerError(error)
    }
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel Daily Usage')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' onClick={handleExport}>
          <Download data-icon='inline-start' />
          {t('Export CSV')}
        </Button>
        <Button
          variant='outline'
          disabled={busy}
          onClick={() =>
            recalculateMutation.mutate({
              start_date: startDate,
              end_date: endDate,
              timezone: 'UTC',
            })
          }
        >
          <RefreshCw data-icon='inline-start' />
          {t('Recalculate')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <div className='bg-muted/40 rounded-lg border p-3 text-sm'>
            <p className='font-medium'>{t('UTC reporting basis')}</p>
            <p className='text-muted-foreground mt-1'>
              {t(
                'Each row covers a UTC calendar day. Billed requests are business requests that produced a consumption log, not every upstream HTTP attempt.'
              )}
            </p>
          </div>

          <div className='grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5'>
            <label className='space-y-1 text-sm'>
              <span>{t('Start Date')}</span>
              <Input
                type='date'
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('End Date')}</span>
              <Input
                type='date'
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Channel ID')}</span>
              <Input
                inputMode='numeric'
                value={channelId}
                placeholder={t('All Channels')}
                onChange={(event) => {
                  setChannelId(event.target.value.replaceAll(/\D/g, ''))
                  setPage(1)
                }}
              />
            </label>
            <label className='space-y-1 text-sm'>
              <span>{t('Model')}</span>
              <Input
                value={modelName}
                placeholder={t('All Models')}
                onChange={(event) => {
                  setModelName(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <div className='flex items-end gap-2'>
              <Button
                variant='outline'
                disabled={busy || !startDate}
                onClick={() =>
                  lockMutation.mutate({ ...monthRange, timezone: 'UTC' })
                }
              >
                <Lock data-icon='inline-start' />
                {t('Lock Month')}
              </Button>
              <Button
                variant='outline'
                disabled={busy || !startDate}
                onClick={() =>
                  unlockMutation.mutate({ ...monthRange, timezone: 'UTC' })
                }
              >
                <Unlock data-icon='inline-start' />
                {t('Unlock')}
              </Button>
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Billed Requests')}</CardTitle>
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
                <CardTitle>{t('User Revenue')}</CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                {formatUsd(summary?.customer_revenue_usd)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Data Exceptions')}</CardTitle>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                {formatInteger(
                  (summary?.missing_usage_count ?? 0) +
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
                    <TableHead>{t('UTC Date')}</TableHead>
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
                      {t('User Revenue')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('Exceptions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
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
                          row.missing_usage_count + row.manual_review_count
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
                        {t('No daily usage data found')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
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
  )
}
