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
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='token-boat-auth-shell relative grid min-h-svh max-w-none overflow-hidden'>
      <div aria-hidden className='token-boat-aurora opacity-60' />
      <div aria-hidden className='token-boat-beam' />
      <Link
        to='/'
        className='border-primary/15 bg-background/70 text-foreground hover:bg-background/90 hover:text-primary absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border py-1.5 pr-4 pl-2 shadow-sm backdrop-blur-xl transition-all hover:scale-[1.01] sm:top-8 sm:left-8'
      >
        <ArrowLeft className='text-muted-foreground size-4' />
        <div className='relative h-7 w-7'>
          {loading ? (
            <Skeleton className='absolute inset-0 rounded-full' />
          ) : (
            <img
              src={logo}
              alt={t('Logo')}
              className='h-7 w-7 object-contain'
            />
          )}
        </div>
        {loading ? (
          <Skeleton className='h-6 w-24' />
        ) : (
          <h1 className='flex h-7 max-w-[10rem] items-center truncate text-sm leading-none font-semibold'>
            {systemName}
          </h1>
        )}
      </Link>
      <div className='container relative z-10 flex items-center pt-20 sm:pt-0'>
        <div className='token-boat-glow-card border-primary/15 bg-background/72 mx-auto flex w-full flex-col justify-center space-y-2 rounded-3xl border px-5 py-7 shadow-[0_28px_100px_-60px_color-mix(in_oklch,var(--secondary)_70%,transparent)] backdrop-blur-2xl sm:w-[480px] sm:p-8'>
          {children}
        </div>
      </div>
    </div>
  )
}
