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
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Compass,
  Gauge,
  Globe2,
  LockKeyhole,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isHttpUrl, isLikelyHtml } from '@/lib/content-format'
import { cn } from '@/lib/utils'

import { getAboutContent } from './api'

type AboutFeature = {
  icon: typeof Network
  title: string
  description: string
}

const capabilities: AboutFeature[] = [
  {
    icon: Network,
    title: 'Unified model gateway',
    description:
      'Connect OpenAI-compatible, Claude-compatible, Gemini-compatible, image, audio, and task channels behind one clean API surface.',
  },
  {
    icon: Route,
    title: 'Flexible routing control',
    description:
      'Route requests by model, group, priority, health, weight, and cost policy so applications can stay stable as providers change.',
  },
  {
    icon: WalletCards,
    title: 'Built-in quota and billing',
    description:
      'Manage tokens, prepaid balance, pricing ratios, consumption logs, and settlement flows without rebuilding account infrastructure.',
  },
  {
    icon: ShieldCheck,
    title: 'Operational visibility',
    description:
      'Track keys, channels, errors, task status, user activity, and usage analytics from an admin console designed for daily operations.',
  },
]

const principles: AboutFeature[] = [
  {
    icon: Gauge,
    title: 'Reliable by default',
    description:
      'Token Boat is designed for provider failover, request tracing, and predictable gateway behavior under real production traffic.',
  },
  {
    icon: LockKeyhole,
    title: 'Secure access boundaries',
    description:
      'API keys, user permissions, admin controls, and optional passkeys help keep model access governed and auditable.',
  },
  {
    icon: Boxes,
    title: 'Ready for secondary development',
    description:
      'The codebase follows a layered backend and modern React frontend so teams can extend providers, billing, dashboards, and workflows.',
  },
]

const metrics = [
  { value: '23', label: 'Provider channel types' },
  { value: '3', label: 'Supported databases' },
  { value: '1', label: 'Unified API entry' },
]

function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow: string
  title: string
  description: string
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('max-w-3xl space-y-3', className)}>
      <Badge className='border-primary/20 bg-primary/10 text-primary rounded-full px-3 py-1 shadow-none hover:bg-primary/10'>
        {t(eyebrow)}
      </Badge>
      <h2 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
        {t(title)}
      </h2>
      <p className='text-muted-foreground text-base leading-7 sm:text-lg'>
        {t(description)}
      </p>
    </div>
  )
}

function FeatureCard({
  feature,
  index,
}: {
  feature: AboutFeature
  index: number
}) {
  const { t } = useTranslation()
  const Icon = feature.icon

  return (
    <article
      className='token-boat-glow-card border-primary/10 bg-background/72 rounded-2xl border p-5 shadow-[0_24px_80px_-56px_color-mix(in_oklch,var(--secondary)_70%,transparent)] backdrop-blur-xl'
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className='from-primary/15 to-secondary/15 text-primary mb-5 flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br'>
        <Icon className='size-5' />
      </div>
      <h3 className='text-lg font-semibold'>{t(feature.title)}</h3>
      <p className='text-muted-foreground mt-3 text-sm leading-6'>
        {t(feature.description)}
      </p>
    </article>
  )
}

function DefaultAboutContent() {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <div className='token-boat-home relative overflow-hidden'>
      <div aria-hidden className='token-boat-aurora opacity-70' />
      <div aria-hidden className='token-boat-beam' />
      <div aria-hidden className='token-boat-orbit hidden lg:block' />

      <section className='container relative z-10 grid min-h-[72vh] items-center gap-12 pt-28 pb-16 lg:grid-cols-[1.05fr_0.95fr]'>
        <div className='max-w-4xl space-y-8'>
          <Badge className='border-primary/20 bg-background/70 text-primary rounded-full px-3 py-1 shadow-none backdrop-blur-md hover:bg-background/70'>
            <Sparkles className='mr-1.5 size-3.5' />
            {t('Token Boat AI gateway platform')}
          </Badge>
          <div className='space-y-5'>
            <h1 className='max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl'>
              {t('Build one gateway for every AI model')}
            </h1>
            <p className='text-muted-foreground max-w-2xl text-lg leading-8 sm:text-xl'>
              {t(
                'Token Boat helps teams aggregate model providers, standardize API access, manage quota and billing, and keep AI applications observable from one console.'
              )}
            </p>
          </div>
          <div className='flex flex-wrap gap-3'>
            <Button
              className='from-primary to-secondary text-primary-foreground h-11 rounded-full bg-gradient-to-r px-5 shadow-[0_18px_44px_-22px_color-mix(in_oklch,var(--primary)_90%,transparent)]'
              render={<Link to='/dashboard' />}
            >
              {t('Open console')}
              <ArrowRight className='size-4' />
            </Button>
            <Button
              variant='outline'
              className='border-primary/15 bg-background/70 h-11 rounded-full px-5 backdrop-blur-md'
              render={
                <a
                  href='http://tokenboat.com'
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              <Globe2 className='size-4' />
              tokenboat.com
            </Button>
          </div>
        </div>

        <div className='relative'>
          <div className='token-boat-glow-card border-primary/15 bg-background/68 relative rounded-3xl border p-6 shadow-[0_40px_120px_-70px_color-mix(in_oklch,var(--primary)_80%,transparent)] backdrop-blur-2xl'>
            <div className='from-primary/12 to-secondary/12 absolute inset-4 rounded-2xl bg-gradient-to-br opacity-60' />
            <div className='relative space-y-6'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-muted-foreground text-sm'>
                    {t('Gateway status')}
                  </p>
                  <h2 className='text-2xl font-semibold'>Token Boat</h2>
                </div>
                <Badge className='bg-emerald-500/12 text-emerald-600 hover:bg-emerald-500/12 dark:text-emerald-400'>
                  <BadgeCheck className='mr-1 size-3.5' />
                  {t('Production ready')}
                </Badge>
              </div>
              <div className='grid gap-3'>
                {[
                  'Provider aggregation',
                  'Quota accounting',
                  'Request analytics',
                  'Admin operations',
                ].map((item) => (
                  <div
                    key={item}
                    className='bg-background/65 flex items-center justify-between rounded-2xl px-4 py-3 backdrop-blur-md'
                  >
                    <span className='text-sm font-medium'>{t(item)}</span>
                    <span className='bg-primary size-2 rounded-full shadow-[0_0_18px_var(--primary)]' />
                  </div>
                ))}
              </div>
              <div className='grid grid-cols-3 gap-3'>
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className='bg-background/72 rounded-2xl p-4 text-center backdrop-blur-md'
                  >
                    <div className='from-primary to-secondary bg-gradient-to-r bg-clip-text text-3xl font-semibold text-transparent'>
                      {metric.value}
                    </div>
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                      {t(metric.label)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='relative z-10 border-t border-primary/10 bg-background/45 py-20 backdrop-blur-xl'>
        <div className='container space-y-10'>
          <SectionHeading
            eyebrow='What Token Boat does'
            title='A control plane for model access'
            description='Use Token Boat as the operational layer between applications and upstream AI providers, with consistent authentication, routing, metering, and monitoring.'
          />
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {capabilities.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className='relative z-10 py-20'>
        <div className='container grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start'>
          <SectionHeading
            eyebrow='Built for teams'
            title='Designed for fast integration and long-term operation'
            description='The platform keeps the gateway practical: simple for developers to call, clear for operators to monitor, and flexible for administrators to configure.'
          />
          <div className='grid gap-4'>
            {principles.map((feature, index) => (
              <FeatureCard key={feature.title} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      <section className='relative z-10 border-t border-primary/10 py-16'>
        <div className='container flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between'>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <Compass className='text-primary size-5' />
              <h2 className='text-2xl font-semibold'>{t('Our direction')}</h2>
            </div>
            <p className='text-muted-foreground max-w-2xl leading-7'>
              {t(
                'We are building Token Boat into a dependable AI infrastructure product that makes model access easier to govern, scale, and evolve.'
              )}
            </p>
          </div>
          <p className='text-muted-foreground text-sm'>© {currentYear} Token Boat</p>
        </div>
      </section>
    </div>
  )
}

export function About() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['about-content'],
    queryFn: getAboutContent,
  })

  const rawContent = data?.data?.trim() ?? ''
  const hasContent = rawContent.length > 0
  const isUrl = hasContent && isHttpUrl(rawContent)
  const contentIsHtml = hasContent && isLikelyHtml(rawContent)

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-12 w-[55%]' />
          <Skeleton className='h-5 w-full' />
          <Skeleton className='h-5 w-[90%]' />
          <div className='grid gap-4 pt-8 md:grid-cols-3'>
            <Skeleton className='h-36 rounded-2xl' />
            <Skeleton className='h-36 rounded-2xl' />
            <Skeleton className='h-36 rounded-2xl' />
          </div>
        </div>
      </PublicLayout>
    )
  }

  if (!hasContent) {
    return (
      <PublicLayout showMainContainer={false}>
        <DefaultAboutContent />
      </PublicLayout>
    )
  }

  if (isUrl) {
    return (
      <PublicLayout showMainContainer={false}>
        <iframe
          src={rawContent}
          className='h-[calc(100vh-3.5rem)] w-full border-0'
          title={t('About')}
          sandbox='allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts'
        />
      </PublicLayout>
    )
  }

  if (contentIsHtml) {
    return (
      <PublicLayout showMainContainer={false}>
        <RichContent
          mode='html'
          htmlVariant='isolated'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <RichContent
          mode='markdown'
          content={rawContent}
          className='prose-neutral dark:prose-invert max-w-none'
        />
      </div>
    </PublicLayout>
  )
}
