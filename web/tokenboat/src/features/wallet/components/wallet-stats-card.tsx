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
import { Activity, BarChart3, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <div className='token-boat-cockpit-strip overflow-hidden rounded-xl'>
        <div className='grid gap-2.5 p-2.5 lg:grid-cols-[minmax(260px,1.15fr)_repeat(2,minmax(210px,0.72fr))]'>
          <div className='token-boat-glass-panel rounded-xl border p-3 sm:p-4'>
            <Skeleton className='h-3.5 w-24' />
            <Skeleton className='mt-3 h-9 w-48' />
            <Skeleton className='mt-2 h-4 w-40' />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className='token-boat-glass-panel rounded-xl border px-3 py-3'
            >
              <Skeleton className='h-3.5 w-20' />
              <Skeleton className='mt-2 h-7 w-28' />
              <Skeleton className='mt-1.5 h-3.5 w-24' />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const secondaryStats = [
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
      description: t('Total consumed quota'),
      icon: BarChart3,
    },
    {
      label: t('API Requests'),
      value: (props.user?.request_count ?? 0).toLocaleString(),
      description: t('Total requests made'),
      icon: Activity,
    },
  ]

  return (
    <div className='token-boat-cockpit-strip relative overflow-hidden rounded-xl'>
      <div className='token-boat-hairline pointer-events-none absolute inset-x-0 top-0 h-px' />
      <div className='relative grid gap-2.5 p-2.5 lg:grid-cols-[minmax(260px,1.15fr)_repeat(2,minmax(210px,0.72fr))]'>
        <div className='from-primary to-secondary text-primary-foreground relative min-h-28 overflow-hidden rounded-xl bg-gradient-to-br p-4 shadow-[0_20px_54px_-24px_color-mix(in_oklch,var(--primary)_70%,black)]'>
          <div className='pointer-events-none absolute inset-0 [background-image:linear-gradient(120deg,transparent_0%,rgba(255,255,255,.34)_45%,transparent_72%)] opacity-30' />
          <div className='pointer-events-none absolute -right-8 -bottom-12 h-40 w-40 rounded-full border border-white/20' />
          <div className='flex items-center justify-between gap-3'>
            <div>
              <div className='text-xs font-medium tracking-wider text-white/78 uppercase'>
                {t('Current Balance')}
              </div>
              <div className='mt-1 text-xs text-white/62'>
                {t('Remaining quota')}
              </div>
            </div>
            <span className='flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/22 bg-white/12 shadow-sm backdrop-blur'>
              <WalletCards className='size-4' />
            </span>
          </div>
          <div className='mt-3 flex flex-wrap items-end gap-2'>
            <div className='font-mono text-2xl font-semibold tracking-tight break-all tabular-nums sm:text-3xl'>
              {formatQuota(props.user?.quota ?? 0)}
            </div>
          </div>
          <div className='mt-3 text-xs text-white/68'>
            {t('Remaining quota')}
          </div>
        </div>

        {secondaryStats.map((item) => (
          <div
            key={item.label}
            className='token-boat-glass-panel min-h-28 rounded-xl border p-3'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='text-muted-foreground truncate text-xs font-medium tracking-wider uppercase'>
                  {item.label}
                </div>
                <div className='mt-1.5 truncate text-lg font-semibold tracking-tight tabular-nums'>
                  {item.value}
                </div>
              </div>
              <span className='bg-primary/7 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                <item.icon className='size-4' />
              </span>
            </div>
            <div className='text-muted-foreground mt-1.5 text-xs'>
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
