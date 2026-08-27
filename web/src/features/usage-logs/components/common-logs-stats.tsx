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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

type StatAccent =
  | 'quota'
  | 'rpm'
  | 'tpm'
  | 'request'
  | 'token'
  | 'prompt'
  | 'completion'
  | 'failure'
  | 'cache'

const accentBarMap: Record<StatAccent, string> = {
  quota: 'bg-cyan-500',
  rpm: 'bg-rose-500',
  tpm: 'bg-sky-500',
  request: 'bg-violet-500',
  token: 'bg-emerald-500',
  prompt: 'bg-teal-500',
  completion: 'bg-lime-500',
  failure: 'bg-red-500',
  cache: 'bg-amber-500',
}

const accentValueMap: Record<StatAccent, string | undefined> = {
  quota: undefined,
  rpm: undefined,
  tpm: undefined,
  request: undefined,
  token: undefined,
  prompt: undefined,
  completion: undefined,
  failure: 'text-red-600',
  cache: undefined,
}

function StatItem(props: {
  label: string
  value: string
  subLabel?: string
  accent?: StatAccent
  hidden?: boolean
}) {
  const barClass = props.accent ? accentBarMap[props.accent] : 'bg-border'
  const valueAccentClass = props.accent
    ? accentValueMap[props.accent]
    : undefined

  const labelContent = (
    <div className='flex items-center gap-1'>
      <span className='text-muted-foreground'>{props.label}</span>
      {props.subLabel && (
        <span className='text-muted-foreground/60 text-xs'>
          ({props.subLabel})
        </span>
      )}
    </div>
  )

  return (
    <div className='flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm shadow-sm'>
      <span className={cn('h-4 w-0.5 shrink-0 rounded-sm', barClass)} />
      {props.subLabel ? (
        <Tooltip>
          <TooltipTrigger className='cursor-default'>
            {labelContent}
          </TooltipTrigger>
          <TooltipContent>
            <div className='text-xs'>
              {props.label} — {props.subLabel}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        labelContent
      )}
      <span
        className={cn('font-mono font-semibold tabular-nums', valueAccentClass)}
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
    <div className='flex flex-wrap items-center gap-2'>
      <StatItem
        label={t('Requests')}
        subLabel={t('Request Count')}
        value={formatNumber(stats?.request_count ?? 0)}
        accent='request'
      />
      <StatItem
        label={t('Failures')}
        subLabel={t('Failed Requests')}
        value={formatNumber(stats?.failure_count ?? 0)}
        accent='failure'
      />
      <StatItem
        label={t('Failure Rate')}
        subLabel={t('Failure Proportion')}
        value={formatPercent((stats?.failure_rate ?? 0) * 100)}
        accent='failure'
      />
      <StatItem
        label={t('Peak RPM')}
        subLabel={t('Requests Per Minute Peak')}
        value={formatCompactNumber(stats?.peak_rpm ?? 0)}
        accent='rpm'
      />
      <StatItem
        label={t('Peak TPM')}
        subLabel={t('Tokens Per Minute Peak')}
        value={formatCompactNumber(stats?.peak_tpm ?? 0)}
        accent='tpm'
      />
      <StatItem
        label={t('Tokens')}
        subLabel={t('Total Tokens')}
        value={formatCompactNumber(stats?.total_tokens ?? 0)}
        accent='token'
      />
      <StatItem
        label={t('Input Tokens')}
        subLabel={t('Prompt Tokens')}
        value={formatCompactNumber(stats?.prompt_tokens ?? 0)}
        accent='prompt'
      />
      <StatItem
        label={t('Output Tokens')}
        subLabel={t('Completion Tokens')}
        value={formatCompactNumber(stats?.completion_tokens ?? 0)}
        accent='completion'
      />
      <StatItem
        label={t('Cache Hit')}
        subLabel={t('Cached Tokens')}
        value={formatCompactNumber(stats?.cache_hit_tokens ?? 0)}
        accent='cache'
      />
      <StatItem
        label={t('Cache')}
        subLabel={t('Cache Hit Rate')}
        value={formatPercent((stats?.cache_hit_rate ?? 0) * 100)}
        accent='cache'
      />
      <StatItem
        label={t('Cost')}
        subLabel={t('Quota Used')}
        value={formatLogQuota(stats?.quota ?? 0)}
        accent='quota'
        hidden={!sensitiveVisible}
      />
    </div>
  )
}
