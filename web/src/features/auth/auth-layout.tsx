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
  ArrowUpRight,
  Route,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

const AUTH_HIGHLIGHTS = [
  {
    icon: Route,
    title: 'Unified API',
    detail: 'One endpoint',
  },
  {
    icon: Activity,
    title: 'Live usage',
    detail: 'Clear insights',
  },
  {
    icon: ShieldCheck,
    title: 'Secure access',
    detail: 'Built for teams',
  },
] as const

export function AuthLayout(props: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <main className='token-boat-auth-shell relative min-h-svh overflow-hidden'>
      <div aria-hidden className='token-boat-aurora opacity-65' />
      <div aria-hidden className='token-boat-beam opacity-70' />

      <div className='relative z-10 mx-auto grid min-h-svh w-full max-w-[1600px] lg:grid-cols-[minmax(0,1.05fr)_minmax(500px,0.95fr)]'>
        <section
          data-testid='auth-brand-panel'
          className='relative hidden min-h-svh flex-col justify-between overflow-hidden border-r border-white/10 p-12 lg:flex xl:p-16'
        >
          <Link
            to='/'
            className='group flex w-fit items-center gap-3 transition-opacity hover:opacity-85'
          >
            <div className='relative size-11'>
              {loading ? (
                <Skeleton className='absolute inset-0 rounded-2xl' />
              ) : (
                <img
                  src={logo}
                  alt={t('Logo')}
                  className='size-11 rounded-2xl object-cover shadow-lg shadow-black/10'
                />
              )}
            </div>
            <div>
              {loading ? (
                <Skeleton className='h-7 w-28' />
              ) : (
                <p className='text-xl font-semibold tracking-tight'>
                  {systemName}
                </p>
              )}
              <p className='text-muted-foreground text-xs'>
                {t('AI Model API Relay Platform')}
              </p>
            </div>
            <ArrowUpRight className='text-muted-foreground ml-1 size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5' />
          </Link>

          <div className='max-w-2xl py-16'>
            <div className='border-primary/25 bg-primary/10 text-primary mb-8 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold tracking-wide uppercase backdrop-blur'>
              <Sparkles className='size-3.5' />
              {t('One account, every leading model')}
            </div>
            <h1 className='max-w-xl text-5xl leading-[1.04] font-semibold tracking-[-0.045em] xl:text-6xl'>
              {t('Build faster with a unified AI gateway')}
            </h1>
            <p className='text-muted-foreground mt-7 max-w-xl text-lg leading-8'>
              {t(
                'Connect to leading AI models, manage access, and track every request from one production-ready platform.'
              )}
            </p>

            <div className='mt-12 grid max-w-xl grid-cols-3 gap-3'>
              {AUTH_HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className='border-border/60 bg-background/55 rounded-2xl border p-4 shadow-sm backdrop-blur-xl'
                >
                  <item.icon
                    className='text-primary mb-5 size-5'
                    aria-hidden='true'
                  />
                  <p className='text-sm font-semibold'>{t(item.title)}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t(item.detail)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          data-testid='auth-form-panel'
          className='flex min-h-svh items-center justify-center px-5 py-20 sm:px-8 lg:px-12 xl:px-20'
        >
          <div className='w-full max-w-[560px]'>
            <Link
              to='/'
              className='mb-10 flex w-fit items-center gap-3 transition-opacity hover:opacity-85 lg:hidden'
            >
              <div className='relative size-10'>
                {loading ? (
                  <Skeleton className='absolute inset-0 rounded-xl' />
                ) : (
                  <img
                    src={logo}
                    alt={t('Logo')}
                    className='size-10 rounded-xl object-cover'
                  />
                )}
              </div>
              {loading ? (
                <Skeleton className='h-6 w-24' />
              ) : (
                <span className='text-xl font-semibold'>{systemName}</span>
              )}
            </Link>

            <div className='border-border/70 bg-card/88 rounded-[2rem] border p-6 shadow-[0_32px_100px_-45px_color-mix(in_oklch,var(--foreground)_38%,transparent)] backdrop-blur-2xl sm:p-10'>
              {props.children}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
