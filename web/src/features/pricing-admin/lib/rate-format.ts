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
const unsignedDecimalPattern = /^\d+(?:\.\d+)?$/

function normalizeUnsignedDecimal(value: string): string {
  const trimmed = value.trim()
  if (!unsignedDecimalPattern.test(trimmed)) {
    return trimmed
  }
  const [wholePart, fractionalPart = ''] = trimmed.split('.')
  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, '')
  const normalizedFraction = fractionalPart.replace(/0+$/, '')
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole
}

function shiftUnsignedDecimal(value: string, places: number): string {
  const normalized = normalizeUnsignedDecimal(value)
  if (!unsignedDecimalPattern.test(normalized)) {
    return normalized
  }
  const [wholePart, fractionalPart = ''] = normalized.split('.')
  const digits = `${wholePart}${fractionalPart}`
  const decimalIndex = wholePart.length + places

  if (decimalIndex <= 0) {
    return normalizeUnsignedDecimal(`0.${'0'.repeat(-decimalIndex)}${digits}`)
  }
  if (decimalIndex >= digits.length) {
    return normalizeUnsignedDecimal(
      `${digits}${'0'.repeat(decimalIndex - digits.length)}`
    )
  }
  return normalizeUnsignedDecimal(
    `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
  )
}

export function storedRateToPercentage(value: string): string {
  return shiftUnsignedDecimal(value, 2)
}

export function percentageToStoredRate(value: string): string {
  return shiftUnsignedDecimal(value, -2)
}

export function formatStoredRatePercentage(value?: string): string {
  if (!value?.trim()) {
    return '—'
  }
  return `${storedRateToPercentage(value)}%`
}
