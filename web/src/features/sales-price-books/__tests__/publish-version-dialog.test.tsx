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

import { PublishVersionDialog } from '../components/publish-version-dialog'
import type {
  SalesPriceBook,
  SalesPriceBookItem,
  SalesPriceBookVersion,
  SalesPriceBookVersionDiff,
} from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let result = key
      for (const [name, value] of Object.entries(values ?? {})) {
        result = result.replaceAll(`{{${name}}}`, String(value))
      }
      return result
    },
  }),
}))

afterEach(cleanup)

test('publication summary uses effective channel margins when overrides exist', () => {
  const activeVersion = {
    id: 1,
    version: 1,
    status: 'active',
  } as SalesPriceBookVersion
  const draftVersion = {
    id: 2,
    version: 2,
    status: 'draft',
  } as SalesPriceBookVersion
  const item = {
    id: 10,
    status: 'enabled',
  } as SalesPriceBookItem
  const book = {
    id: 1,
    name: 'TOC Default',
    audience: 'toc',
    assigned_users: 0,
    current_version: activeVersion,
  } as SalesPriceBook
  const diff = {
    added_count: 1,
    changed_count: 0,
    removed_count: 0,
    items: [
      {
        change_type: 'added',
        price_change_rate: '',
        margin_after: '-0.0117',
        new_item: item,
        new_channel_margins: [{ margin_rate: '0.03' }],
      },
    ],
  } as SalesPriceBookVersionDiff

  render(
    <PublishVersionDialog
      candidate={{ book, version: draftVersion, items: [item], diff }}
      pending={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
    />
  )

  expect(screen.getByText('3%')).toBeInTheDocument()
  expect(screen.queryByText('-1.17%')).not.toBeInTheDocument()
})
