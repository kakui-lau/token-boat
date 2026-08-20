/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { CircleDollarSign, FileWarning, Gauge, ReceiptText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { TokenMillionsHint } from '@/components/token-millions-hint'
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
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { SortableUsageTableHead } from '../channel-daily-usage/components/sortable-usage-table-head'
import type {
  ChannelUsageSortBy,
  ChannelUsageSortOrder,
} from '../channel-daily-usage/types'
import { getChannelMonthlyUsageChannels, getChannelMonthlyUsages } from './api'
import type {
  ChannelMonthlyUsageFilters,
  ChannelMonthlyUsageGroupBy,
} from './types'

const PAGE_SIZE = 50

function currentUtcMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function monthDateRange(month: string): {
  start_date: string
  end_date: string
} {
  const [year, monthNumber] = month.split('-').map(Number)
  const end = new Date(Date.UTC(year, monthNumber, 0))
  return {
    start_date: `${month}-01`,
    end_date: end.toISOString().slice(0, 10),
  }
}

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

function formatTimestamp(value: number | undefined): string {
  if (!value) return '—'
  return new Date(value * 1000).toLocaleString()
}

export function ChannelMonthlyUsagePage() {
  const { t } = useTranslation()
  const [month, setMonth] = useState(currentUtcMonth)
  const [groupBy, setGroupBy] =
    useState<ChannelMonthlyUsageGroupBy>('upstream_model')
  const [channelId, setChannelId] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<ChannelUsageSortBy>('total_tokens')
  const [sortOrder, setSortOrder] = useState<ChannelUsageSortOrder>('desc')
  const dateRange = monthDateRange(month)

  const filters = useMemo<ChannelMonthlyUsageFilters>(
    () => ({
      month,
      group_by: groupBy,
      channel_id: channelId ? Number(channelId) : undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
      page,
      page_size: PAGE_SIZE,
    }),
    [channelId, groupBy, month, page, sortBy, sortOrder]
  )

  const usageQuery = useQuery({
    queryKey: ['channel-monthly-usages', filters],
    queryFn: () => getChannelMonthlyUsages(filters),
  })
  const channelQuery = useQuery({
    queryKey: ['channel-monthly-usage-channels', dateRange],
    queryFn: () => getChannelMonthlyUsageChannels(dateRange),
  })

  const rows = usageQuery.data?.data?.items ?? []
  const total = usageQuery.data?.data?.total ?? 0
  const summary = usageQuery.data?.data?.summary
  const channelOptions = useMemo(
    () => [
      { value: '', label: t('All Channels') },
      ...(channelQuery.data?.data?.channels ?? []).map((channel) => ({
        value: String(channel.channel_id),
        label: channel.channel_name
          ? `${channel.channel_name} (#${channel.channel_id})`
          : `#${channel.channel_id}`,
      })),
    ],
    [channelQuery.data?.data?.channels, t]
  )
  const exceptionCount =
    (summary?.missing_usage_count ?? 0) +
    (summary?.pending_task_count ?? 0) +
    (summary?.manual_review_count ?? 0)
  const groupLabel =
    groupBy === 'upstream_model' ? t('Upstream Model') : t('Platform Model')

  const handleSort = (nextSortBy: ChannelUsageSortBy) => {
    if (nextSortBy === sortBy) {
      setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(nextSortBy)
      setSortOrder('desc')
    }
    setPage(1)
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel Monthly Summary')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-5'>
          <Card className='border-primary/20 bg-primary/5'>
            <CardHeader>
              <CardTitle>{t('UTC monthly channel reconciliation')}</CardTitle>
              <CardAction className='text-muted-foreground text-sm font-normal'>
                {t('Last updated:')}{' '}
                {formatTimestamp(summary?.last_calculated_at)}
              </CardAction>
            </CardHeader>
            <CardContent className='text-muted-foreground'>
              {t(
                'Review one complete UTC month by channel and choose whether model totals are grouped by the platform model or upstream model.'
              )}
            </CardContent>
          </Card>

          <Card className='relative z-10 overflow-visible'>
            <CardHeader>
              <CardTitle>{t('Report filters')}</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              <div className='grid gap-1.5'>
                <Label htmlFor='monthly-usage-month'>{t('UTC Month')}</Label>
                <Input
                  id='monthly-usage-month'
                  type='month'
                  max={currentUtcMonth()}
                  value={month}
                  onChange={(event) => {
                    if (event.target.value) {
                      setMonth(event.target.value)
                      setPage(1)
                    }
                  }}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label>{t('Group By')}</Label>
                <Select
                  items={[
                    {
                      value: 'upstream_model',
                      label: t('Upstream Model'),
                    },
                    { value: 'model_name', label: t('Platform Model') },
                  ]}
                  value={groupBy}
                  onValueChange={(value) => {
                    if (value) {
                      const nextGroupBy = value as ChannelMonthlyUsageGroupBy
                      setGroupBy(nextGroupBy)
                      if (
                        sortBy === 'model_name' ||
                        sortBy === 'upstream_model'
                      ) {
                        setSortBy(nextGroupBy)
                      }
                      setPage(1)
                    }
                  }}
                >
                  <SelectTrigger className='w-full' aria-label={t('Group By')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='upstream_model'>
                        {t('Upstream Model')}
                      </SelectItem>
                      <SelectItem value='model_name'>
                        {t('Platform Model')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor='monthly-usage-channel'>{t('Channel')}</Label>
                <ComboboxInput
                  id='monthly-usage-channel'
                  options={channelOptions}
                  value={channelId}
                  placeholder={t('All Channels')}
                  onValueChange={(value) => {
                    setChannelId(value)
                    setPage(1)
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Request Count')}</CardTitle>
                <CardAction>
                  <Gauge className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                {formatInteger(summary?.billed_request_count)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Total Tokens')}</CardTitle>
                <CardAction>
                  <ReceiptText className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                {formatInteger(summary?.total_tokens)}
                <TokenMillionsHint tokens={summary?.total_tokens} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Billed Amount')}</CardTitle>
                <CardAction>
                  <CircleDollarSign className='text-muted-foreground size-4' />
                </CardAction>
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
                <CardTitle>{t('Reported Provider Cost')}</CardTitle>
                <CardAction>
                  <ReceiptText className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold'>
                {formatUsd(summary?.provider_reported_cost_usd)}
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
                {formatInteger(exceptionCount)}
              </CardContent>
            </Card>
          </div>

          <Card className='overflow-hidden'>
            <CardHeader>
              <CardTitle>{t('Usage Details')}</CardTitle>
              <CardDescription>
                {t('Click a column header to sort all matching records.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableUsageTableHead
                        label={t('Channel')}
                        sortBy='channel_name'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={groupLabel}
                        sortBy={groupBy}
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Request Count')}
                        sortBy='billed_request_count'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Input Tokens')}
                        sortBy='prompt_tokens'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Cache Read Tokens')}
                        sortBy='cache_read_tokens'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Cache Write Tokens')}
                        sortBy='cache_write_tokens'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Output Tokens')}
                        sortBy='completion_tokens'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Total Tokens')}
                        sortBy='total_tokens'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Billed Amount')}
                        sortBy='customer_revenue_usd'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Reported Provider Cost')}
                        sortBy='provider_reported_cost_usd'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Cost Coverage')}
                        sortBy='cost_coverage'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                      <SortableUsageTableHead
                        label={t('Exceptions')}
                        sortBy='exceptions'
                        activeSortBy={sortBy}
                        sortOrder={sortOrder}
                        align='right'
                        onSort={handleSort}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={`${row.channel_id}:${row.model_name ?? ''}:${row.upstream_model ?? ''}`}
                      >
                        <TableCell>
                          {row.channel_name || `#${row.channel_id}`}
                        </TableCell>
                        <TableCell>
                          {groupBy === 'upstream_model'
                            ? row.upstream_model
                            : row.model_name}
                        </TableCell>
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
                          {formatInteger(row.cache_write_tokens)}
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
                          {formatUsd(row.provider_reported_cost_usd)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(row.provider_cost_known_count)} /{' '}
                          {formatInteger(row.billed_request_count)}
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
                          colSpan={12}
                          className='text-muted-foreground h-24 text-center'
                        >
                          {t('No monthly channel usage data found')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  {summary && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2}>{t('Total')}</TableCell>
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
                          {formatInteger(summary.cache_write_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.completion_tokens)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.total_tokens)}
                          <TokenMillionsHint tokens={summary.total_tokens} />
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatUsd(summary.customer_revenue_usd)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatUsd(summary.provider_reported_cost_usd)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(summary.provider_cost_known_count)} /{' '}
                          {formatInteger(summary.billed_request_count)}
                        </TableCell>
                        <TableCell className='text-right'>
                          {formatInteger(exceptionCount)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
              <div className='flex items-center justify-between border-t px-4 py-3 text-sm'>
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
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
