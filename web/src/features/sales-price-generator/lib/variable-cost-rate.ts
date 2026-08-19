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

export function calculateVariableCostPercentage(values: string[]): string {
  const normalizedValues = values.map((value) => value.trim())
  if (normalizedValues.some((value) => !unsignedDecimalPattern.test(value))) {
    return ''
  }

  const decimalPlaces = normalizedValues.reduce((maximum, value) => {
    const fractionalPart = value.split('.')[1] ?? ''
    return Math.max(maximum, fractionalPart.length)
  }, 0)
  let total = 0n
  for (const value of normalizedValues) {
    const [wholePart, fractionalPart = ''] = value.split('.')
    total += BigInt(`${wholePart}${fractionalPart.padEnd(decimalPlaces, '0')}`)
  }

  if (decimalPlaces === 0) return total.toString()

  const digits = total.toString().padStart(decimalPlaces + 1, '0')
  const wholePart = digits.slice(0, -decimalPlaces)
  const fractionalPart = digits.slice(-decimalPlaces).replace(/0+$/, '')
  return fractionalPart ? `${wholePart}.${fractionalPart}` : wholePart
}
