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
import { afterEach, expect, test, vi } from 'vitest'

import { PriceBookStatusBadges } from '../components/price-book-status'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(() => {
  cleanup()
})

test('identifies the enabled TOC default price book in the status cell', () => {
  render(<PriceBookStatusBadges status='enabled' isTocDefault />)

  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(screen.getByText('TOC default')).toBeInTheDocument()
})

test('does not mark an ordinary enabled price book as the TOC default', () => {
  render(<PriceBookStatusBadges status='enabled' isTocDefault={false} />)

  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(screen.queryByText('TOC default')).not.toBeInTheDocument()
})
