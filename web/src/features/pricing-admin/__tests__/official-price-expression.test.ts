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
import { describe, expect, test } from 'vitest'

import {
  buildV2TokenBillingExpression,
  tokenBillingEditorBody,
} from '../lib/official-price-expression'

describe('official token price expression normalization', () => {
  test('keeps an explicit V2 expression idempotent', () => {
    const expression = 'v2:(tier("base", p * 2 + c * 4)) / 1000000'

    expect(buildV2TokenBillingExpression(expression)).toBe(expression)
    expect(tokenBillingEditorBody(expression)).toBe(
      'tier("base", p * 2 + c * 4)'
    )
  })

  test('upgrades a V1 editor expression to the V2 currency contract', () => {
    expect(
      buildV2TokenBillingExpression('v1:tier("base", p * 2 + c * 4)')
    ).toBe('v2:(tier("base", p * 2 + c * 4)) / 1000000')
  })
})
