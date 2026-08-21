/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Clock3, RefreshCw, Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getChannelModelProbes } from './api'
import type {
  ChannelModelProbe,
  ChannelModelProbeFilters,
  ChannelModelProbeStatus,
} from './types'

const DEFAULT_PAGE_SIZE = 200
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const
const TIME_WINDOW_OPTIONS = [24, 72, 168, 720] as const

function formatTimestamp(value: number): string {
  return value > 0 ? new Date(value * 1000).toLocaleString() : '—'
}

function successRate(successCount: number, totalCount: number): string {
  if (totalCount === 0) return '—'
  return `${((successCount / totalCount) * 100).toFixed(2)}%`
}

function ProbeTableRows(props: {
  rows: ChannelModelProbe[]
  isLoading: boolean
  isError: boolean
}) {
  const { t } = useTranslation()
  if (props.isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={7} className='h-28 text-center'>
          {t('Loading...')}
        </TableCell>
      </TableRow>
    )
  }
  if (props.isError) {
    return (
      <TableRow>
        <TableCell colSpan={7} className='text-destructive h-28 text-center'>
          {t('Failed to load probe records')}
        </TableCell>
      </TableRow>
    )
  }
  if (props.rows.length === 0) {
    return (
      <TableRow>
        <TableCell
          colSpan={7}
          className='text-muted-foreground h-28 text-center'
        >
          {t('No probe records found')}
        </TableCell>
      </TableRow>
    )
  }
  return props.rows.map((row) => (
    <TableRow
      key={row.id}
      className='[contain-intrinsic-size:0_52px] [content-visibility:auto]'
    >
      <TableCell className='whitespace-nowrap'>
        {formatTimestamp(row.probed_at)}
      </TableCell>
      <TableCell>
        <div className='font-medium'>
          {row.channel_name || `#${row.channel_id}`}
        </div>
        <div className='text-muted-foreground text-xs'>#{row.channel_id}</div>
      </TableCell>
      <TableCell className='max-w-[320px] font-mono text-xs break-all'>
        {row.model_name}
      </TableCell>
      <TableCell>
        <Badge variant='outline'>{row.endpoint_type || '—'}</Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant={row.success ? 'outline' : 'destructive'}
          className={
            row.success
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : undefined
          }
        >
          {row.success ? t('Succeeded') : t('Failed')}
        </Badge>
      </TableCell>
      <TableCell className='text-right font-mono tabular-nums'>
        {row.latency_ms} ms
      </TableCell>
      <TableCell className='max-w-[360px]'>
        {row.success ? (
          <span className='text-muted-foreground'>—</span>
        ) : (
          <div className='space-y-1'>
            {row.error_code && (
              <Badge variant='secondary'>{row.error_code}</Badge>
            )}
            <p
              className='text-muted-foreground line-clamp-2 text-xs'
              title={row.error_message}
            >
              {row.error_message || t('Unknown error')}
            </p>
          </div>
        )}
      </TableCell>
    </TableRow>
  ))
}

export function ChannelModelProbesPage() {
  const { t } = useTranslation()
  const [keywordInput, setKeywordInput] = useState('')
  const [filters, setFilters] = useState<ChannelModelProbeFilters>({
    keyword: '',
    status: '',
    hours: 72,
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })

  const probeQuery = useQuery({
    queryKey: ['channel-model-probes', filters],
    queryFn: () => getChannelModelProbes(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
  const data = probeQuery.data?.data
  const rows = data?.items ?? []
  const channels = data?.channels ?? []
  const total = data?.total ?? 0
  const summary = data?.summary ?? {
    total_count: 0,
    success_count: 0,
    failed_count: 0,
    avg_latency_ms: 0,
    last_probed_at: 0,
  }
  const totalPages = Math.max(1, Math.ceil(total / filters.page_size))

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilters((current) => ({
      ...current,
      keyword: keywordInput.trim(),
      page: 1,
    }))
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Channel Model Probes')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          onClick={() => probeQuery.refetch()}
          disabled={probeQuery.isFetching}
        >
          <RefreshCw className={probeQuery.isFetching ? 'animate-spin' : ''} />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-5'>
          <Card className='border-primary/20 bg-primary/5'>
            <CardHeader>
              <CardTitle>{t('Active probe history')}</CardTitle>
              <CardDescription>
                {t(
                  'Shows scheduled probe results for text models, including the selected channel, latency, and sanitized failure details.'
                )}
              </CardDescription>
            </CardHeader>
          </Card>

          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Probe Count')}</CardTitle>
                <CardAction>
                  <Activity className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold tabular-nums'>
                {summary.total_count.toLocaleString()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Success Rate')}</CardTitle>
                <CardAction>
                  <CheckCircle2 className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold tabular-nums'>
                {successRate(summary.success_count, summary.total_count)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Average Latency')}</CardTitle>
                <CardAction>
                  <Clock3 className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-2xl font-semibold tabular-nums'>
                {summary.total_count > 0 ? `${summary.avg_latency_ms} ms` : '—'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Last Probe')}</CardTitle>
                <CardAction>
                  <Clock3 className='text-muted-foreground size-4' />
                </CardAction>
              </CardHeader>
              <CardContent className='text-base font-semibold'>
                {formatTimestamp(summary.last_probed_at)}
              </CardContent>
            </Card>
          </div>

          <Card className='overflow-visible'>
            <CardHeader>
              <CardTitle>{t('Probe filters')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className='grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_240px_180px_180px_auto] xl:items-end'
                onSubmit={submitKeyword}
              >
                <div className='grid gap-1.5'>
                  <Label htmlFor='probe-keyword'>{t('Keyword')}</Label>
                  <Input
                    id='probe-keyword'
                    value={keywordInput}
                    placeholder={t('Search channel or model')}
                    onChange={(event) => setKeywordInput(event.target.value)}
                  />
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='probe-channel'>{t('Channel')}</Label>
                  <NativeSelect
                    id='probe-channel'
                    value={String(filters.channel_id ?? '')}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        channel_id: event.target.value
                          ? Number(event.target.value)
                          : undefined,
                        page: 1,
                      }))
                    }
                  >
                    <NativeSelectOption value=''>
                      {t('All Channels')}
                    </NativeSelectOption>
                    {channels.map((channel) => (
                      <NativeSelectOption
                        key={channel.channel_id}
                        value={String(channel.channel_id)}
                      >
                        {`${channel.channel_name || `#${channel.channel_id}`} (#${channel.channel_id})`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='probe-status'>{t('Status')}</Label>
                  <NativeSelect
                    id='probe-status'
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        status: event.target.value as ChannelModelProbeStatus,
                        page: 1,
                      }))
                    }
                  >
                    <NativeSelectOption value=''>
                      {t('All Statuses')}
                    </NativeSelectOption>
                    <NativeSelectOption value='success'>
                      {t('Succeeded')}
                    </NativeSelectOption>
                    <NativeSelectOption value='failed'>
                      {t('Failed')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className='grid gap-1.5'>
                  <Label htmlFor='probe-window'>{t('Time Range')}</Label>
                  <NativeSelect
                    id='probe-window'
                    value={String(filters.hours)}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        hours: Number(event.target.value),
                        page: 1,
                      }))
                    }
                  >
                    {TIME_WINDOW_OPTIONS.map((hours) => (
                      <NativeSelectOption key={hours} value={String(hours)}>
                        {hours < 24 * 30
                          ? t('Past {{hours}} hours', { hours })
                          : t('Past 30 days')}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <Button type='submit'>
                  <Search />
                  {t('Search')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className='overflow-hidden'>
            <CardHeader>
              <CardTitle>{t('Probe records')}</CardTitle>
              <CardDescription>
                {t('{{total}} records match the current filters.', { total })}
              </CardDescription>
            </CardHeader>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <Table className='min-w-[1080px]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Probe Time')}</TableHead>
                      <TableHead>{t('Channel')}</TableHead>
                      <TableHead>{t('Model')}</TableHead>
                      <TableHead>{t('Endpoint')}</TableHead>
                      <TableHead>{t('Result')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Latency')}
                      </TableHead>
                      <TableHead>{t('Failure Details')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <ProbeTableRows
                      rows={rows}
                      isLoading={probeQuery.isLoading}
                      isError={probeQuery.isError}
                    />
                  </TableBody>
                </Table>
              </div>
              <div className='flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between'>
                <div className='flex items-center gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Rows per page')}
                  </span>
                  <NativeSelect
                    className='h-8 w-[76px]'
                    aria-label={t('Rows per page')}
                    value={String(filters.page_size)}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        page_size: Number(event.target.value),
                        page: 1,
                      }))
                    }
                  >
                    {PAGE_SIZE_OPTIONS.map((pageSize) => (
                      <NativeSelectOption
                        key={pageSize}
                        value={String(pageSize)}
                      >
                        {pageSize}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={filters.page <= 1 || probeQuery.isFetching}
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: current.page - 1,
                      }))
                    }
                  >
                    {t('Previous')}
                  </Button>
                  <span className='text-sm'>
                    {t('Page {{page}} of {{total}}', {
                      page: filters.page,
                      total: totalPages,
                    })}
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={
                      filters.page >= totalPages || probeQuery.isFetching
                    }
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        page: current.page + 1,
                      }))
                    }
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
