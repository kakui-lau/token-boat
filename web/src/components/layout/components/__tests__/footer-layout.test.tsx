// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { Footer } from '../footer'

const systemConfig = vi.hoisted(() => ({
  systemName: 'Token Boat',
  logo: '/logo.png',
  footerHtml: '',
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    children: ReactNode
    className?: string
    to: string
    'aria-label'?: string
  }) => (
    <a
      href={props.to}
      className={props.className}
      aria-label={props['aria-label']}
    >
      {props.children}
    </a>
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => systemConfig,
}))

describe('Footer layout', () => {
  beforeEach(() => {
    systemConfig.footerHtml = ''
  })

  afterEach(cleanup)

  test('uses a responsive single-to-three-column layout for default navigation', () => {
    render(<Footer />)

    expect(screen.getByTestId('footer-shell')).not.toHaveClass(
      'rounded-[2rem]',
      'border',
      'shadow-[0_28px_90px_-54px_rgba(15,23,42,0.5)]'
    )
    expect(screen.getByTestId('footer-logo')).not.toHaveClass(
      'border',
      'rounded-2xl'
    )
    expect(screen.getByTestId('footer-link-columns')).toHaveClass(
      'grid-cols-1',
      'min-[420px]:grid-cols-2',
      'sm:grid-cols-3'
    )
    expect(
      screen.getAllByRole('link', { name: 'Terms of Service' })[0]
    ).toBeVisible()
  })

  test('keeps custom footer content inside the branded footer shell', () => {
    systemConfig.footerHtml = '<strong>Custom service notice</strong>'

    render(<Footer />)

    const footer = screen.getByTestId('public-footer')

    expect(footer).toHaveTextContent('Custom service notice')
    expect(screen.getByRole('link', { name: 'Token Boat' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeVisible()
  })
})
