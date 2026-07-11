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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { RankingPeriod } from '../types'

const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

type RankingsHeroProps = {
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
}

/**
 * Hero strip for the rankings page. Intentionally minimal — title +
 * subtitle + period tabs only.
 */
export function RankingsHero(props: RankingsHeroProps) {
  const { t } = useTranslation()

  return (
    <section className='grid gap-6 pt-4 sm:pt-8 lg:grid-cols-[1fr_auto] lg:items-end'>
      <div className='max-w-3xl space-y-4'>
        <div className='border-primary/15 bg-background/70 text-primary inline-flex rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur-md'>
          {t('Rankings')}
        </div>
        <h1 className='text-[clamp(1.9rem,4.6vw,3.25rem)] leading-[1.08] font-semibold tracking-tight'>
          {t('Rankings')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-sm leading-7 sm:text-base'>
          {t(
            'Discover the most-used models and rising vendors on the platform, updated from live usage data.'
          )}
        </p>
      </div>

      <div
        role='tablist'
        aria-label={t('Period')}
        className='border-primary/15 bg-background/72 flex w-fit items-center rounded-full border p-1 shadow-[0_20px_60px_-48px_color-mix(in_oklch,var(--primary)_85%,transparent)] backdrop-blur-xl'
      >
        {PERIODS.map((p) => {
          const isActive = props.period === p.id
          return (
            <button
              key={p.id}
              role='tab'
              type='button'
              aria-selected={isActive}
              onClick={() => props.onPeriodChange(p.id)}
              className={cn(
                'focus-visible:ring-ring/40 relative rounded-full px-4 py-2 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
              )}
            >
              {t(p.labelKey)}
            </button>
          )
        })}
      </div>
    </section>
  )
}
