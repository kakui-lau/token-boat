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
import type { SalesPriceBookItem } from '../types'

export type SalesPriceBookPublicationIssue =
  | { type: 'empty' }
  | { type: 'review'; items: SalesPriceBookItem[] }

export function getSalesPriceBookPublicationIssue(
  items: SalesPriceBookItem[]
): SalesPriceBookPublicationIssue | undefined {
  if (items.length === 0) {
    return { type: 'empty' }
  }
  const pendingReviews = items.filter(
    (item) => item.status === 'review_required'
  )
  if (pendingReviews.length > 0) {
    return { type: 'review', items: pendingReviews }
  }
  return undefined
}
