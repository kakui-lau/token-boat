/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Coins, Cpu, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatLogQuota, formatTokens, formatUseTime } from '@/lib/format'

import { getUserModelUsage } from './api'
import type { UserModelUsageFilters } from './types'

const PAGE_SIZE = 50

function dateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function defaultDateRange(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { start: dateInputValue(start), end: dateInputValue(end) }
}

function startOfLocalDay(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000)
}

function endOfLocalDay(value: string): number {
  return Math.floor(new Date(`${value}T23:59:59`).getTime() / 1000)
}

export function UserModelUsagePage() {
  const { t } = useTranslation()
  const [initialRange] = useState(defaultDateRange)
  const [draftStartDate, setDraftStartDate] = useState(initialRange.start)
  const [draftEndDate, setDraftEndDate] = useState(initialRange.end)
  const [draftUsername, setDraftUsername] = useState('')
  const [draftModelName, setDraftModelName] = useState('')
  const [filters, setFilters] = useState({
    startDate: initialRange.start,
    endDate: initialRange.end,
    username: '',
    modelName: '',
  })
  const [page, setPage] = useState(1)

  const queryFilters = useMemo<UserModelUsageFilters>(
    () => ({
      start_timestamp: startOfLocalDay(filters.startDate),
      end_timestamp: endOfLocalDay(filters.endDate),
      username: filters.username || undefined,
      model_name: filters.modelName || undefined,
      p: page,
      page_size: PAGE_SIZE,
    }),
    [filters, page]
  )

  const usageQuery = useQuery({
    queryKey: ['user-model-usage', queryFilters],
    queryFn: () => getUserModelUsage(queryFilters),
    placeholderData: (previousData) => previousData,
  })
  const data = usageQuery.data?.data
  const summary = data?.summary
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))

  const applyFilters = () => {
    setPage(1)
    setFilters({
      startDate: draftStartDate,
      endDate: draftEndDate,
      username: draftUsername.trim(),
      modelName: draftModelName.trim(),
    })
  }

  const resetFilters = () => {
    const range = defaultDateRange()
    setDraftStartDate(range.start)
    setDraftEndDate(range.end)
    setDraftUsername('')
    setDraftModelName('')
    setPage(1)
    setFilters({
      startDate: range.start,
      endDate: range.end,
      username: '',
      modelName: '',
    })
  }

  let tableContent: React.ReactNode
  if (usageQuery.isLoading) {
    tableContent = (
      <TableRow>
        <TableCell colSpan={7} className='h-32 text-center'>
          {t('Loading...')}
        </TableCell>
      </TableRow>
    )
  } else if ((data?.items.length ?? 0) === 0) {
    tableContent = (
      <TableRow>
        <TableCell colSpan={7} className='h-32 text-center'>
          {t('No usage data found')}
        </TableCell>
      </TableRow>
    )
  } else {
    tableContent = data?.items.map((row) => (
      <TableRow key={`${row.user_id}:${row.model_name}`}>
        <TableCell className='pl-6'>
          <div className='font-medium'>{row.username || '-'}</div>
          <div className='text-muted-foreground text-xs'>ID {row.user_id}</div>
        </TableCell>
        <TableCell
          className='max-w-[280px] truncate font-mono'
          title={row.model_name}
        >
          {row.model_name}
        </TableCell>
        <TableCell className='text-right font-mono tabular-nums'>
          {row.request_count.toLocaleString()}
        </TableCell>
        <TableCell className='text-right font-mono tabular-nums'>
          {formatTokens(row.prompt_tokens)}
        </TableCell>
        <TableCell className='text-right font-mono tabular-nums'>
          {formatTokens(row.completion_tokens)}
        </TableCell>
        <TableCell className='text-right font-mono tabular-nums'>
          {formatUseTime(row.average_use_time)}
        </TableCell>
        <TableCell className='pr-6 text-right font-mono font-semibold tabular-nums'>
          {formatLogQuota(row.quota)}
        </TableCell>
      </TableRow>
    ))
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('User model usage')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-5'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Usage filters')}</CardTitle>
              <CardDescription>
                {t(
                  'Analyze model consumption by user within a selected period.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                <div className='space-y-2'>
                  <Label htmlFor='usage-start-date'>{t('Start Date')}</Label>
                  <Input
                    id='usage-start-date'
                    type='date'
                    value={draftStartDate}
                    max={draftEndDate}
                    onChange={(event) => setDraftStartDate(event.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='usage-end-date'>{t('End Date')}</Label>
                  <Input
                    id='usage-end-date'
                    type='date'
                    value={draftEndDate}
                    min={draftStartDate}
                    onChange={(event) => setDraftEndDate(event.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='usage-username'>{t('Username')}</Label>
                  <Input
                    id='usage-username'
                    value={draftUsername}
                    placeholder={t('All users')}
                    onChange={(event) => setDraftUsername(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyFilters()
                    }}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='usage-model-name'>{t('Model Name')}</Label>
                  <Input
                    id='usage-model-name'
                    value={draftModelName}
                    placeholder={t('All models')}
                    onChange={(event) => setDraftModelName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyFilters()
                    }}
                  />
                </div>
              </div>
              <div className='mt-4 flex justify-end gap-2'>
                <Button variant='outline' onClick={resetFilters}>
                  {t('Reset')}
                </Button>
                <Button
                  onClick={applyFilters}
                  disabled={!draftStartDate || !draftEndDate}
                >
                  {t('Search')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <SummaryCard
              title={t('Total consumption')}
              value={formatLogQuota(summary?.quota ?? 0)}
              icon={<Coins aria-hidden='true' />}
            />
            <SummaryCard
              title={t('Requests')}
              value={(summary?.request_count ?? 0).toLocaleString()}
              icon={<BarChart3 aria-hidden='true' />}
            />
            <SummaryCard
              title={t('Models used')}
              value={(summary?.model_count ?? 0).toLocaleString()}
              icon={<Cpu aria-hidden='true' />}
            />
            <SummaryCard
              title={t('Users')}
              value={(summary?.user_count ?? 0).toLocaleString()}
              icon={<Users aria-hidden='true' />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('Consumption by model')}</CardTitle>
              <CardDescription>
                {t('Refunds are deducted from the displayed consumption.')}
              </CardDescription>
            </CardHeader>
            <CardContent className='px-0'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='pl-6'>{t('User')}</TableHead>
                      <TableHead>{t('Model')}</TableHead>
                      <TableHead className='text-right'>
                        {t('Requests')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Input Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Output Tokens')}
                      </TableHead>
                      <TableHead className='text-right'>
                        {t('Average response time')}
                      </TableHead>
                      <TableHead className='pr-6 text-right'>
                        {t('Consumption')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{tableContent}</TableBody>
                </Table>
              </div>
              <div className='flex items-center justify-between border-t px-6 pt-4'>
                <span className='text-muted-foreground text-sm'>
                  {t('{{count}} records', { count: data?.total ?? 0 })}
                </span>
                <div className='flex items-center gap-2'>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page <= 1 || usageQuery.isFetching}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    {t('Previous')}
                  </Button>
                  <span className='text-sm tabular-nums'>
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={page >= totalPages || usageQuery.isFetching}
                    onClick={() => setPage((current) => current + 1)}
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

function SummaryCard(props: {
  title: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className='flex items-center justify-between p-5'>
        <div>
          <p className='text-muted-foreground text-sm'>{props.title}</p>
          <p className='mt-1 text-2xl font-semibold tabular-nums'>
            {props.value}
          </p>
        </div>
        <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg [&_svg]:size-5'>
          {props.icon}
        </div>
      </CardContent>
    </Card>
  )
}
