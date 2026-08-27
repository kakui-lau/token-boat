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
import { expect, test, vi } from 'vitest'

import {
  readSalesPriceBookSelection,
  writeSalesPriceBookSelection,
} from '../lib/selection-storage'

function memoryStorage(initialValue: string | null = null) {
  let value = initialValue
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue
    }),
    removeItem: vi.fn(() => {
      value = null
    }),
  }
}

test('restores the selected price book and draft after a page refresh', () => {
  const storage = memoryStorage()

  writeSalesPriceBookSelection(storage, { bookId: 1, versionId: 18 })

  expect(readSalesPriceBookSelection(storage)).toEqual({
    bookId: 1,
    versionId: 18,
  })
})

test('ignores stale or malformed persisted selections', () => {
  expect(
    readSalesPriceBookSelection(
      memoryStorage('{"bookId":0,"versionId":"draft"}')
    )
  ).toEqual({})
  expect(readSalesPriceBookSelection(memoryStorage('not-json'))).toEqual({})
})
