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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Compass,
  Globe2,
  Network,
  Route,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

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
    title: 'Model Access',
    description: 'Compatible API routes for common AI application workflows',
  },
  {
    icon: Route,
    title: 'Global Coverage',
    description: 'Multi-region deployment for stable global access',
  },
  {
    icon: WalletCards,
    title: 'Transparent Billing',
    description: 'Pay-as-you-go with real-time usage monitoring',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Reliable',
    description:
      'Enterprise-grade security with comprehensive permission management',
  },
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
      <Badge className='border-primary/20 bg-primary/10 text-primary hover:bg-primary/10 rounded-full px-3 py-1 shadow-none'>
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

      <section className='relative z-10 container grid min-h-[72vh] items-center gap-12 pt-28 pb-16 lg:grid-cols-[1.05fr_0.95fr]'>
        <div className='max-w-4xl space-y-8'>
          <Badge className='border-primary/20 bg-background/70 text-primary hover:bg-background/70 rounded-full px-3 py-1 shadow-none backdrop-blur-md'>
            <Sparkles className='mr-1.5 size-3.5' />
            {t('AI Model API Relay Platform')}
          </Badge>
          <div className='space-y-5'>
            <h1 className='max-w-4xl text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl'>
              {t('Unified Access to')} {t('Leading AI Models')}
            </h1>
            <p className='text-muted-foreground max-w-2xl text-lg leading-8 sm:text-xl'>
              {t('about.introduction')}
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
                    {t('AI Model API Relay Platform')}
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
            </div>
          </div>
        </div>
      </section>

      <section className='border-primary/10 bg-background/45 relative z-10 border-t py-20 backdrop-blur-xl'>
        <div className='container space-y-10'>
          <SectionHeading
            eyebrow='What Token Boat does'
            title='For Individuals & Businesses'
            description='about.services.description'
          />
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {capabilities.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                feature={feature}
                index={index}
              />
            ))}
          </div>
        </div>
      </section>

      <section className='relative z-10 py-24'>
        <div className='container flex flex-col gap-12'>
          <div className='grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center'>
            <div className='flex flex-col gap-7'>
              <SectionHeading
                eyebrow='about.company.title'
                title='about.title'
                description='about.company.description'
              />
              <p className='text-muted-foreground max-w-2xl leading-7'>
                {t(
                  'We help individuals and organizations use AI models with less integration overhead and clearer operational control.'
                )}
              </p>
              <div className='flex flex-wrap gap-2'>
                {['Unified API', 'Flexible routing', 'Usage visibility'].map(
                  (item) => (
                    <Badge
                      key={item}
                      variant='secondary'
                      className='rounded-full'
                    >
                      {t(item)}
                    </Badge>
                  )
                )}
              </div>
            </div>

            <article className='token-boat-glow-card border-primary/10 bg-background/72 overflow-hidden rounded-3xl border backdrop-blur-xl'>
              <div className='from-primary/12 to-secondary/10 flex items-center gap-4 bg-gradient-to-r p-6 sm:p-8'>
                <div className='bg-background/75 text-primary flex size-12 items-center justify-center rounded-2xl shadow-sm'>
                  <Building2 className='size-6' aria-hidden='true' />
                </div>
                <div>
                  <p className='text-muted-foreground text-sm'>
                    {t('Platform operator')}
                  </p>
                  <h3 className='text-xl font-semibold'>TokenBoat</h3>
                </div>
                <Badge variant='secondary' className='ml-auto rounded-full'>
                  <BadgeCheck className='size-3.5' aria-hidden='true' />
                  {t('Hong Kong registered company')}
                </Badge>
              </div>
              <dl className='bg-border/60 grid gap-px sm:grid-cols-3'>
                {[
                  [
                    t('about.company.legalName'),
                    'ORBITER TECHNOLOGY CO., LIMITED',
                  ],
                  [t('Registered region'), t('Hong Kong')],
                  [t('Official website'), 'tokenboat.com'],
                ].map(([label, value]) => (
                  <div key={label} className='bg-background/90 p-5 sm:p-6'>
                    <dt className='text-muted-foreground text-xs tracking-wider uppercase'>
                      {label}
                    </dt>
                    <dd className='mt-2 text-sm font-semibold break-words'>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          </div>

          <div className='border-primary/10 bg-background/55 rounded-3xl border p-6 backdrop-blur-xl sm:p-8 lg:p-10'>
            <div className='flex flex-col gap-3'>
              <div className='flex items-center gap-2'>
                <Compass className='text-primary size-5' aria-hidden='true' />
                <h2 className='text-2xl font-semibold'>
                  {t('Our commitments')}
                </h2>
              </div>
              <p className='text-muted-foreground max-w-3xl leading-7'>
                {t(
                  'We focus on the essentials that make an AI gateway dependable for everyday use.'
                )}
              </p>
            </div>

            <div className='mt-8 grid gap-4 md:grid-cols-3'>
              {[
                {
                  icon: Route,
                  title: 'Stable access',
                  description:
                    'Provider routing and operational visibility designed to keep model access predictable.',
                },
                {
                  icon: WalletCards,
                  title: 'Clear billing',
                  description:
                    'Usage records and pricing information help every request remain understandable.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Security and control',
                  description:
                    'Keys, permissions, and account controls support responsible access management.',
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <article
                    key={item.title}
                    className='bg-background/75 rounded-2xl p-5'
                  >
                    <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl'>
                      <Icon className='size-5' aria-hidden='true' />
                    </div>
                    <h3 className='mt-5 font-semibold'>{t(item.title)}</h3>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                      {t(item.description)}
                    </p>
                  </article>
                )
              })}
            </div>

            <div className='border-primary/10 mt-8 flex flex-col gap-5 border-t pt-6 sm:flex-row sm:items-center sm:justify-between'>
              <nav
                aria-label={t('Legal and support')}
                className='flex flex-wrap gap-4 text-sm'
              >
                <Link
                  to='/user-agreement'
                  className='text-muted-foreground hover:text-foreground'
                >
                  {t('User Agreement')}
                </Link>
                <Link
                  to='/privacy-policy'
                  className='text-muted-foreground hover:text-foreground'
                >
                  {t('Privacy Policy')}
                </Link>
                <Link
                  to='/support/community-interaction'
                  className='text-muted-foreground hover:text-foreground'
                >
                  {t('Contact us')}
                </Link>
              </nav>
              <p className='text-muted-foreground text-sm'>
                © {currentYear} Token Boat
              </p>
            </div>
          </div>
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
