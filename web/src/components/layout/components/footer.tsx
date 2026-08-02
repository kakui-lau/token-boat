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
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HtmlContent } from '@/components/html-content'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

interface FooterLink {
  text: string
  href: string
}

interface FooterColumnProps {
  title: string
  links: FooterLink[]
}

interface FooterProps {
  logo?: string
  name?: string
  columns?: FooterColumnProps[]
  copyright?: string
  className?: string
}

const DEFAULT_COLUMNS: FooterColumnProps[] = [
  {
    title: 'footer.columns.about.title',
    links: [
      {
        text: 'footer.columns.about.links.aboutProject',
        href: '/about',
      },
      {
        text: 'footer.columns.about.links.contact',
        href: '/support/community-interaction',
      },
      {
        text: 'footer.columns.about.links.features',
        href: '/wiki/features-introduction',
      },
    ],
  },
  {
    title: 'footer.columns.docs.title',
    links: [
      {
        text: 'footer.columns.docs.links.quickStart',
        href: '/getting-started',
      },
      {
        text: 'footer.columns.docs.links.installation',
        href: 'http://tokenboat.com/installation/',
      },
      {
        text: 'footer.columns.docs.links.apiDocs',
        href: 'https://api-docs.tokenboat.com',
      },
    ],
  },
  {
    title: 'Legal',
    links: [
      { text: 'Terms of Service', href: '/terms' },
      { text: 'Privacy Policy', href: '/privacy' },
      { text: 'Refund Policy', href: '/refund' },
    ],
  },
]

function FooterLinkItem(props: { link: FooterLink }) {
  const { t } = useTranslation()
  const isExternal = props.link.href.startsWith('http')
  const label = t(props.link.text)

  if (isExternal) {
    return (
      <a
        href={props.link.href}
        target='_blank'
        rel='noopener noreferrer'
        className='text-muted-foreground hover:text-foreground group/link inline-flex items-center gap-1.5 text-sm transition-colors duration-200'
      >
        {label}
        <ArrowUpRight
          aria-hidden='true'
          className='size-3.5 opacity-45 transition-transform duration-200 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 group-hover/link:opacity-100'
        />
      </a>
    )
  }

  return (
    <Link
      to={props.link.href}
      className='text-muted-foreground hover:text-foreground inline-flex text-sm transition-colors duration-200'
    >
      {label}
    </Link>
  )
}

// Renders User Agreement / Privacy Policy links inline with the parent's
// copyright row when either is configured in System Settings → Site. Emits
// fragmented siblings so the parent flex container's gap controls spacing.
function LegalLinks(props: { leadingSeparator?: boolean }) {
  const { t } = useTranslation()
  const items = [
    { key: 'terms', label: t('Terms of Service'), href: '/terms' },
    { key: 'privacy', label: t('Privacy Policy'), href: '/privacy' },
    { key: 'refund', label: t('Refund Policy'), href: '/refund' },
  ]
  return (
    <>
      {items.map((item, index) => (
        <span key={item.key} className='contents'>
          {(props.leadingSeparator || index > 0) && (
            <span aria-hidden='true' className='text-muted-foreground/30'>
              ·
            </span>
          )}
          <Link
            to={item.href}
            className='hover:text-foreground rounded-full px-2.5 py-1 transition-colors duration-200 hover:bg-white/60 dark:hover:bg-white/8'
          >
            {item.label}
          </Link>
        </span>
      ))}
    </>
  )
}

// inline=true returns just the inner span for composition in a parent flex
// row. inline=false wraps in a centered/right-aligned div (default).
function ProjectAttribution(props: { currentYear: number; inline?: boolean }) {
  const { t } = useTranslation()
  const content = (
    <span className='text-muted-foreground/45'>
      &copy; {props.currentYear}{' '}
      <a
        href='http://tokenboat.com'
        target='_blank'
        rel='noopener noreferrer'
        className='text-foreground/70 hover:text-foreground font-medium transition-colors'
      >
        TokenBoat
      </a>
      {' · '}
      {t('footer.tokenBoat.operator', {
        company: 'ORBITER TECHNOLOGY CO., LIMITED',
      })}
    </span>
  )
  if (props.inline) {
    return content
  }
  return (
    <div className='text-muted-foreground/45 text-center text-xs sm:text-right'>
      {content}
    </div>
  )
}

export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const { systemName, logo: systemLogo, footerHtml } = useSystemConfig()

  const displayLogo = systemLogo || props.logo || '/logo.png'
  const displayName = systemName || props.name || 'token boat'
  const currentYear = new Date().getFullYear()

  const displayColumns = props.columns ?? DEFAULT_COLUMNS

  if (footerHtml) {
    return (
      <footer
        data-testid='public-footer'
        className={cn(
          'border-border/45 bg-background/45 relative z-10 border-t',
          props.className
        )}
      >
        <div
          data-testid='footer-shell'
          className='mx-auto w-full max-w-[1400px] px-6 py-7 sm:px-8 lg:px-12'
        >
          <div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'>
            <div className='flex min-w-0 items-center gap-4'>
              <Link
                to='/'
                aria-label={displayName}
                data-testid='footer-logo-link'
                className='shrink-0'
              >
                <img
                  src={displayLogo}
                  alt=''
                  className='size-10 object-contain'
                />
              </Link>
              <div className='min-w-0'>
                <p className='text-foreground mb-1 text-base font-semibold tracking-tight'>
                  {displayName}
                </p>
                <p className='text-muted-foreground/55 text-xs'>
                  {t('Unified AI Model API Platform')}
                </p>
              </div>
            </div>
            <nav
              aria-label={t('Legal')}
              className='text-muted-foreground flex flex-wrap items-center gap-0.5 self-start text-xs lg:self-auto'
            >
              <LegalLinks />
            </nav>
          </div>
          <div className='border-border/35 mt-6 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
            <HtmlContent
              content={footerHtml}
              className='text-muted-foreground/55 text-xs'
            />
            <ProjectAttribution currentYear={currentYear} />
          </div>
        </div>
      </footer>
    )
  }

  return (
    <footer
      data-testid='public-footer'
      className={cn(
        'border-border/45 bg-background/45 relative z-10 border-t',
        props.className
      )}
    >
      <div
        data-testid='footer-shell'
        className='mx-auto max-w-[1400px] px-6 sm:px-8 lg:px-12'
      >
        <div className='grid gap-10 py-10 md:grid-cols-[minmax(220px,1.25fr)_2fr] md:py-12 lg:gap-16'>
          {/* Brand column */}
          <div>
            <Link to='/' className='group flex items-center gap-3'>
              <img
                data-testid='footer-logo'
                src={displayLogo}
                alt=''
                className='size-10 object-contain transition-transform duration-200 group-hover:-translate-y-0.5'
              />
              <span className='text-base font-semibold tracking-tight'>
                {displayName}
              </span>
            </Link>
            <p className='text-muted-foreground mt-4 max-w-[280px] text-sm leading-6'>
              {t('Unified AI Model API Platform')}
            </p>
          </div>

          {/* Links columns */}
          <div
            data-testid='footer-link-columns'
            className='grid grid-cols-1 gap-8 min-[420px]:grid-cols-2 sm:grid-cols-3 md:gap-10 lg:gap-16'
          >
            {displayColumns.map((column) => (
              <div key={column.title}>
                <p className='text-foreground mb-4 text-sm font-semibold'>
                  {t(column.title)}
                </p>
                <ul className='flex flex-col gap-3'>
                  {column.links.map((link) => (
                    <li key={`${link.href}-${link.text}`}>
                      <FooterLinkItem link={link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Copyright + optional legal links inline on the left, project
            attribution on the right; wraps on narrow screens. */}
        <div className='border-border/35 flex flex-col items-center justify-between gap-x-3 gap-y-3 border-t py-4 sm:flex-row'>
          <div className='text-muted-foreground/55 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs sm:justify-start'>
            <span>
              &copy; {currentYear} {displayName}.{' '}
              {props.copyright ?? t('footer.defaultCopyright')}
            </span>
            <LegalLinks leadingSeparator />
          </div>
          <ProjectAttribution currentYear={currentYear} />
        </div>
      </div>
    </footer>
  )
}
