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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
  showRechargeAction?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  if (props.loading) {
    return (
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        {['balance', 'usage', 'requests'].map((key) => (
          <div
            key={key}
            className='border-border/60 bg-card/60 rounded-2xl border p-4 shadow-sm backdrop-blur-sm'
          >
            <div className='flex items-center gap-3'>
              <Skeleton className='h-10 w-10 rounded-xl' />
              <Skeleton className='h-4 w-24' />
            </div>
            <Skeleton className='mt-5 h-8 w-32' />
            <Skeleton className='mt-2 h-3.5 w-28' />
          </div>
        ))}
      </div>
    )
  }

  const stats: {
    label: string
    value: string
    description: string
    icon: typeof WalletCards
    tone: IconBadgeTone
    accentClass: string
    lineClass: string
  }[] = [
    {
      label: t('Current Balance'),
      value: formatQuota(props.user?.quota ?? 0),
      description: t('Remaining quota'),
      icon: WalletCards,
      tone: 'success',
      accentClass: 'from-emerald-500/20 via-teal-500/10 to-transparent',
      lineClass: 'bg-emerald-500/70',
    },
    {
      label: t('Total Usage'),
      value: formatQuota(props.user?.used_quota ?? 0),
      description: t('Total consumed quota'),
      icon: BarChart3,
      tone: 'info',
      accentClass: 'from-cyan-500/20 via-sky-500/10 to-transparent',
      lineClass: 'bg-cyan-500/70',
    },
    {
      label: t('API Requests'),
      value: (props.user?.request_count ?? 0).toLocaleString(),
      description: t('Total requests made'),
      icon: Activity,
      tone: 'chart-4',
      accentClass: 'from-amber-500/20 via-orange-500/10 to-transparent',
      lineClass: 'bg-amber-500/70',
    },
  ]

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
      {stats.map((item) => (
        <div
          key={item.label}
          className='group border-border/60 bg-card/65 hover:border-primary/25 hover:bg-card/80 relative min-w-0 overflow-hidden rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5'
        >
          <div
            className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${item.accentClass}`}
          />
          <div className='relative flex items-start justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <IconBadge tone={item.tone} size='stat'>
                <item.icon />
              </IconBadge>
              <div className='min-w-0'>
                <div className='text-foreground truncate text-sm font-semibold'>
                  {item.label}
                </div>
                <div className='text-muted-foreground mt-0.5 hidden text-xs md:block'>
                  {item.description}
                </div>
              </div>
            </div>
            {props.showRechargeAction && item.icon === WalletCards && (
              <Button
                size='sm'
                className='shrink-0 gap-1.5 shadow-sm'
                render={<Link to='/recharge' />}
              >
                <CircleDollarSign className='size-4' />
                {t('Recharge')}
              </Button>
            )}
          </div>

          <div className='relative mt-5 font-mono text-2xl font-black tracking-tight break-all tabular-nums sm:text-3xl'>
            {item.value}
          </div>
          <div
            className={`relative mt-4 h-1 w-12 rounded-full ${item.lineClass}`}
          />
        </div>
      ))}
    </div>
  )
}
