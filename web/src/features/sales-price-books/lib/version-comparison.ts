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
import type { SalesPriceBookVersion } from '../types'

export function getSalesPriceBookComparisonBase(
  versions: SalesPriceBookVersion[],
  selectedVersion: SalesPriceBookVersion | undefined,
  currentVersionId: number | undefined
) {
  if (
    !selectedVersion ||
    (selectedVersion.status !== 'draft' &&
      selectedVersion.status !== 'scheduled')
  ) {
    return undefined
  }
  const currentVersion =
    versions.find((version) => version.id === currentVersionId) ??
    versions.find((version) => version.status === 'active')
  if (!currentVersion || currentVersion.id === selectedVersion.id) {
    return undefined
  }
  return currentVersion
}
