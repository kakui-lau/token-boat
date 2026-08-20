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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCompactNumber,
  formatLogQuota,
  formatNumber,
  formatPercent,
} from '@/lib/format'
import { cn } from '@/lib/utils'

import { getLogStats, getUserLogStats } from '../api'
import { DEFAULT_LOG_STATS } from '../constants'
import { buildApiParams } from '../lib/utils'
import { useLogsViewScope, useUsageLogsContext } from './usage-logs-provider'

const route = getRouteApi('/_authenticated/usage-logs/$section')

function StatItem(props: {
  label: string
  value: string
  accent?: 'danger'
  hidden?: boolean
}) {
  return (
    <div className='flex items-center gap-1.5 text-sm'>
      <span className='text-muted-foreground'>{props.label}</span>
      <span
        className={cn(
          'font-mono font-semibold tabular-nums',
          props.accent === 'danger' && 'text-red-600'
        )}
      >
        {props.hidden ? '••••' : props.value}
      </span>
    </div>
  )
}

export function CommonLogsStats() {
  const { t } = useTranslation()
  const { isAdminView: isAdmin } = useLogsViewScope()
  const searchParams = route.useSearch()
  const { sensitiveVisible } = useUsageLogsContext()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['usage-logs-stats', isAdmin, searchParams],
    queryFn: async () => {
      const params = buildApiParams({
        page: 1,
        pageSize: 1,
        searchParams,
        columnFilters: [],
        isAdmin,
      })

      const result = isAdmin
        ? await getLogStats(params)
        : await getUserLogStats(params)

      return result.success
        ? result.data || DEFAULT_LOG_STATS
        : DEFAULT_LOG_STATS
    },
    placeholderData: (previousData) => previousData,
  })

  if (isLoading) {
    return (
      <div className='flex flex-wrap items-center gap-x-5 gap-y-1.5'>
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
        <Skeleton className='h-5 w-[72px] rounded-md' />
      </div>
    )
  }

  return (
    <div className='flex flex-wrap items-center gap-x-5 gap-y-1.5'>
      <StatItem
        label={t('Requests')}
        value={formatNumber(stats?.request_count ?? 0)}
      />
      <StatItem
        label={t('Failure Rate')}
        value={formatPercent((stats?.failure_rate ?? 0) * 100)}
        accent='danger'
      />
      <StatItem
        label={t('Peak RPM')}
        value={formatCompactNumber(stats?.peak_rpm ?? 0)}
      />
      <StatItem
        label={t('Peak TPM')}
        value={formatCompactNumber(stats?.peak_tpm ?? 0)}
      />
      <StatItem
        label={t('Tokens')}
        value={formatCompactNumber(stats?.total_tokens ?? 0)}
      />
      <StatItem
        label={t('Cost')}
        value={formatLogQuota(stats?.quota ?? 0)}
        hidden={!sensitiveVisible}
      />
      <StatItem
        label={t('Cache')}
        value={formatPercent((stats?.cache_hit_rate ?? 0) * 100)}
      />
    </div>
  )
}
