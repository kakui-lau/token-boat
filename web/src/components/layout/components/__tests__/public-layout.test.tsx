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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PublicLayout } from '../public-layout'

vi.mock('../public-header', () => ({
  PublicHeader: () => <header>Public header</header>,
}))

vi.mock('../footer', () => ({
  Footer: () => <footer>Public footer</footer>,
}))

describe('PublicLayout footer', () => {
  afterEach(cleanup)

  test('renders the footer after public page content in normal document flow', () => {
    render(
      <PublicLayout>
        <div>Page content</div>
      </PublicLayout>
    )

    const content = screen.getByText('Page content')
    const footer = screen.getByRole('contentinfo')

    expect(content.compareDocumentPosition(footer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(footer).not.toHaveClass('fixed', 'sticky')
  })
})
