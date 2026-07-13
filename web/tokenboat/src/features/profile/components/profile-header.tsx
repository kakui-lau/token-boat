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
import {
  Activity,
  BarChart3,
  Mail,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatCompactNumber, formatQuota } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'

// ============================================================================
// Profile Header Component
// ============================================================================

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
}

export function ProfileHeader({ profile, loading }: ProfileHeaderProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Card
        data-card-hover='false'
        className='token-boat-pro-card relative gap-0 overflow-hidden py-0'
      >
        <div className='token-boat-hairline pointer-events-none absolute inset-x-0 top-0 h-px' />
        <CardContent className='p-4 sm:p-5'>
          <div className='token-boat-glass-panel flex flex-col items-center gap-4 rounded-xl border p-3 text-center sm:flex-row sm:text-left'>
            <Skeleton className='h-16 w-16 rounded-2xl' />
            <div className='space-y-3'>
              <div className='flex flex-col items-center gap-2 sm:flex-row sm:justify-start'>
                <Skeleton className='h-8 w-48' />
                <Skeleton className='h-5 w-16' />
              </div>
              <div className='flex flex-col items-center gap-1 sm:flex-row sm:justify-start sm:gap-4'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-4 w-20' />
              </div>
            </div>
          </div>
        </CardContent>
        <div className='bg-background/35 border-t p-2'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className='wallet-strong-control rounded-xl border-2 px-4 py-3.5 sm:px-5 sm:py-4'
              >
                <Skeleton className='h-3.5 w-20' />
                <Skeleton className='mt-2 h-7 w-28' />
                <Skeleton className='mt-1.5 h-3.5 w-24' />
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (!profile) return null

  const displayName = getDisplayName(profile)
  const avatarName = profile.username || displayName
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = getUserAvatarStyle(avatarName)
  const roleLabel = getRoleLabel(profile.role)
  const stats = [
    {
      label: t('Current Balance'),
      value: formatQuota(profile.quota),
      description: t('Remaining quota'),
      icon: WalletCards,
    },
    {
      label: t('Total Usage'),
      value: formatQuota(profile.used_quota),
      description: t('Total consumed quota'),
      icon: BarChart3,
    },
    {
      label: t('API Requests'),
      value: formatCompactNumber(profile.request_count),
      description: t('Total requests made'),
      icon: Activity,
    },
  ]

  return (
    <Card
      data-card-hover='false'
      className='token-boat-pro-card relative gap-0 overflow-hidden py-0'
    >
      <div className='token-boat-hairline pointer-events-none absolute inset-x-0 top-0 h-px' />
      <CardContent className='relative p-2.5 sm:p-3'>
        <div className='token-boat-energy-panel grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.34fr)] lg:items-stretch'>
          <div className='flex min-w-0 items-center gap-3 sm:gap-4'>
            <Avatar className='ring-background size-14 rounded-2xl text-sm shadow-sm ring-4 sm:size-16 sm:text-lg'>
              <AvatarFallback
                className='rounded-2xl font-semibold text-white'
                style={avatarFallbackStyle}
              >
                {avatarFallback}
              </AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='truncate text-xl font-semibold tracking-tight sm:text-2xl'>
                  {displayName}
                </h1>
                <StatusBadge
                  label={roleLabel}
                  variant='neutral'
                  copyable={false}
                />
                <StatusBadge
                  label={`${t('User ID')} ${profile.id}`}
                  variant='info'
                  copyText={String(profile.id)}
                />
              </div>

              <div className='text-muted-foreground mt-2 flex flex-wrap gap-1.5 text-xs'>
                <span className='bg-card/70 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1'>
                  <UserRound className='text-primary size-3.5' />
                  <span className='truncate'>@{profile.username}</span>
                </span>
                {profile.email && (
                  <span className='bg-card/70 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1'>
                    <Mail className='text-primary size-3.5' />
                    <span className='truncate'>{profile.email}</span>
                  </span>
                )}
                {profile.group && (
                  <span className='bg-card/70 inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1'>
                    <ShieldCheck className='text-success size-3.5' />
                    <span className='truncate'>{profile.group}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className='wallet-strong-control bg-primary/[0.07] flex flex-col justify-between rounded-xl border-2 p-3.5'>
            <div className='flex items-center justify-between gap-3'>
              <div className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                {t('Current Balance')}
              </div>
              <span className='bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg'>
                <WalletCards className='size-4' />
              </span>
            </div>
            <div className='mt-3 font-mono text-2xl font-semibold tracking-tight break-all tabular-nums sm:text-[1.7rem]'>
              {formatQuota(profile.quota)}
            </div>
            <div className='text-muted-foreground mt-2 flex items-center gap-2 text-xs'>
              <ShieldCheck className='text-success size-3.5' />
              <span>
                {t('Manage your security settings and account access')}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
      <div className='bg-background/35 relative border-t p-2'>
        <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
          {stats.map((item, index) => (
            <div
              key={item.label}
              className={`wallet-strong-control min-w-0 rounded-xl border-2 bg-background/70 p-3 ${
                index === 0 ? 'md:hidden' : ''
              }`}
            >
              <div className='flex items-center gap-2'>
                <span className='bg-primary/7 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                  <item.icon className='size-4' />
                </span>
                <div className='min-w-0'>
                  <div className='text-muted-foreground truncate text-xs font-medium tracking-wider uppercase'>
                    {item.label}
                  </div>
                  <div className='text-muted-foreground/60 hidden text-xs sm:block'>
                    {item.description}
                  </div>
                </div>
              </div>

              <div className='text-foreground mt-2 truncate font-mono text-lg font-semibold tracking-tight tabular-nums sm:text-xl'>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
