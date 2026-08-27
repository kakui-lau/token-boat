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
type SalesPriceBookSelection = {
  bookId?: number
  versionId?: number
}

type SelectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const selectionStorageKey = 'sales-price-books:selected-detail'

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined
}

export function readSalesPriceBookSelection(
  storage: SelectionStorage | undefined
): SalesPriceBookSelection {
  if (!storage) {
    return {}
  }
  try {
    const raw = storage.getItem(selectionStorageKey)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      bookId: positiveInteger(parsed.bookId),
      versionId: positiveInteger(parsed.versionId),
    }
  } catch {
    return {}
  }
}

export function writeSalesPriceBookSelection(
  storage: SelectionStorage | undefined,
  selection: SalesPriceBookSelection
): void {
  if (!storage) {
    return
  }
  if (!selection.bookId && !selection.versionId) {
    storage.removeItem(selectionStorageKey)
    return
  }
  storage.setItem(selectionStorageKey, JSON.stringify(selection))
}
