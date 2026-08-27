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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import {
  PriceBookSelectionAction,
  SelectablePriceBookRow,
} from '../components/price-book-selection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(() => {
  cleanup()
})

test('selects a price book by clicking its row or using the keyboard', () => {
  const onSelect = vi.fn()

  render(
    <table>
      <tbody>
        <SelectablePriceBookRow selected={false} onSelect={onSelect}>
          <td>Enterprise contract</td>
        </SelectablePriceBookRow>
      </tbody>
    </table>
  )

  const row = screen.getByRole('row', { name: 'Enterprise contract' })
  fireEvent.click(row)
  fireEvent.keyDown(row, { key: 'Enter' })
  fireEvent.keyDown(row, { key: ' ' })

  expect(onSelect).toHaveBeenCalledTimes(3)
  expect(row).toHaveAttribute('aria-selected', 'false')
})

test('does not switch rows when an action inside the row is clicked', () => {
  const onSelect = vi.fn()
  const onEdit = vi.fn()

  render(
    <table>
      <tbody>
        <SelectablePriceBookRow selected={false} onSelect={onSelect}>
          <td>
            <button type='button' onClick={onEdit}>
              Edit
            </button>
          </td>
        </SelectablePriceBookRow>
      </tbody>
    </table>
  )

  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

  expect(onEdit).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

test('shows an explicit view action and replaces it with the current state', () => {
  const onSelect = vi.fn()
  const view = render(
    <PriceBookSelectionAction selected={false} onSelect={onSelect} />
  )

  fireEvent.click(screen.getByRole('button', { name: 'View details' }))
  expect(onSelect).toHaveBeenCalledOnce()

  view.rerender(<PriceBookSelectionAction selected onSelect={onSelect} />)
  expect(screen.getByText('Viewing')).toHaveAttribute('aria-current', 'true')
  expect(
    screen.queryByRole('button', { name: 'View details' })
  ).not.toBeInTheDocument()
})
