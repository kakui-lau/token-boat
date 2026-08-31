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
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import { AuthLayout } from '../auth-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; className?: string }) => (
    <a href='/' className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'Token Boat',
    logo: '/logo.png',
    loading: false,
  }),
}))

describe('AuthLayout', () => {
  test('keeps the product story on desktop while giving the form a dedicated wide panel', () => {
    render(
      <AuthLayout>
        <form aria-label='Authentication form' />
      </AuthLayout>
    )

    const brandPanel = screen.getByTestId('auth-brand-panel')
    const formPanel = screen.getByTestId('auth-form-panel')

    expect(brandPanel).toHaveClass('hidden', 'lg:flex')
    expect(formPanel).toContainElement(
      screen.getByRole('form', { name: 'Authentication form' })
    )
    expect(
      screen.getByRole('heading', {
        name: 'Build faster with a unified AI gateway',
      })
    ).toBeVisible()
    expect(
      screen.queryByText(
        'Reliable access for individuals, teams, and businesses.'
      )
    ).not.toBeInTheDocument()
    expect(screen.getAllByAltText('Logo')).toHaveLength(2)
  })
})
