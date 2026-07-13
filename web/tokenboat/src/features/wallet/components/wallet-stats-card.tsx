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
      <div className='token-boat-pro-card overflow-hidden rounded-xl'>
        <div className='grid gap-2 p-2 sm:p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]'>
          <div className='token-boat-glass-panel rounded-xl border p-4 sm:p-5'>
            <Skeleton className='h-3.5 w-24' />
            <Skeleton className='mt-4 h-10 w-48' />
            <Skeleton className='mt-3 h-4 w-40' />
          </div>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-1'>
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className='token-boat-glass-panel rounded-xl border px-3 py-3 sm:px-4 sm:py-4'
              >
                <Skeleton className='h-3.5 w-20' />
                <Skeleton className='mt-2 h-7 w-28' />
                <Skeleton className='mt-1.5 h-3.5 w-24' />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const stats = [
    {
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
      description: t('Remaining quota'),
      icon: WalletCards,
    },
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

  const balance = stats[0]
  const secondaryStats = stats.slice(1)

  return (
    <div className='token-boat-pro-card relative overflow-hidden rounded-xl'>
      <div className='token-boat-hairline pointer-events-none absolute inset-x-0 top-0 h-px' />
      <div className='relative grid gap-2 p-2 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.82fr)]'>
        <div className='border-primary/20 bg-primary/[0.04] rounded-xl border p-3.5 sm:p-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <div className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                {balance.label}
              </div>
              <div className='text-muted-foreground/70 mt-1 text-xs'>
                {balance.description}
              </div>
            </div>
            <span className='bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl shadow-sm'>
              <balance.icon className='size-4' />
            </span>
          </div>
          <div className='mt-3 font-mono text-2xl font-semibold tracking-tight break-all tabular-nums sm:text-3xl'>
            {balance.value}
          </div>
        </div>

        <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-1'>
          {secondaryStats.map((item) => (
            <div
              key={item.label}
              className='token-boat-glass-panel rounded-xl border px-3 py-3'
            >
              <div className='flex items-center justify-between gap-3'>
                <div className='min-w-0'>
                  <div className='text-muted-foreground truncate text-xs font-medium tracking-wider uppercase'>
                    {item.label}
                  </div>
                  <div className='text-muted-foreground/60 mt-1 hidden text-xs md:block'>
                    {item.description}
                  </div>
                </div>
                <span className='bg-primary/7 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                  <item.icon className='size-4' />
                </span>
              </div>
              <div className='mt-2 font-mono text-lg font-semibold tracking-tight break-all tabular-nums sm:text-xl'>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
