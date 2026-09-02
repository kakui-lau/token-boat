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
import { describe, expect, it } from 'vitest'

import {
  normalizeParameterNumberValue,
  PLAYGROUND_PARAMETER_CONTROLS,
} from '../playground-parameters'

describe('playground decimal parameters', () => {
  it('preserves the Moonshot-required top_p value', () => {
    expect(normalizeParameterNumberValue('top_p', '0.95')).toBe(0.95)
  })

  it('uses hundredth precision for sampling controls', () => {
    const temperature = PLAYGROUND_PARAMETER_CONTROLS.find(
      (control) => control.key === 'temperature'
    )
    const topP = PLAYGROUND_PARAMETER_CONTROLS.find(
      (control) => control.key === 'top_p'
    )

    expect(temperature?.step).toBe(0.01)
    expect(topP?.step).toBe(0.01)
  })
})
