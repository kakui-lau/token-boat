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

export type ParsedRateDetails = {
  vcr: string
  tr: string
  tm: string
}

/**
 * Parse an `effective_rate_details` string like `"VCR 11%；TR 16%；TM 3%"`
 * into individual percentage values.
 *
 * The function is intentionally permissive — it scans for `VCR`, `TR`, and
 * `TM` anywhere in the string and extracts the first decimal number that
 * follows each label.  Unknown or missing values fall back to an empty
 * string.
 */
export function parseEffectiveRateDetails(details: string): ParsedRateDetails {
  const vcrMatch = details.match(/VCR\s+(\d+(?:\.\d+)?)/i)
  const trMatch = details.match(/TR\s+(\d+(?:\.\d+)?)/i)
  const tmMatch = details.match(/TM\s+(\d+(?:\.\d+)?)/i)
  return {
    vcr: vcrMatch?.[1] ?? '',
    tr: trMatch?.[1] ?? '',
    tm: tmMatch?.[1] ?? '',
  }
}
