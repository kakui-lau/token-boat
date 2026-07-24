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
import type { ControllerRenderProps } from 'react-hook-form'
import { describe, expect, test, vi } from 'vitest'

import { safeNumberFieldProps } from './numeric-field'

function createNumberField(value: number | '') {
  return {
    value,
    onChange: vi.fn(),
    onBlur: vi.fn(),
    name: 'amount',
    ref: vi.fn(),
  }
}

function bindNumberField(field: ReturnType<typeof createNumberField>) {
  return safeNumberFieldProps(
    field as unknown as ControllerRenderProps<Record<string, number | ''>>
  )
}

function createNumberChangeEvent(value: string, valueAsNumber: number) {
  return {
    target: {
      value,
      valueAsNumber,
    },
  } as React.ChangeEvent<HTMLInputElement>
}

describe('safeNumberFieldProps', () => {
  test('keeps an input editable when the last digit is deleted', () => {
    const field = createNumberField(1)
    const props = bindNumberField(field)

    props.onChange(createNumberChangeEvent('', Number.NaN))

    expect(field.onChange).toHaveBeenCalledWith('')
  })

  test('passes through finite numbers', () => {
    const field = createNumberField('')
    const props = bindNumberField(field)

    props.onChange(createNumberChangeEvent('2', 2))

    expect(field.onChange).toHaveBeenCalledWith(2)
  })

  test('ignores non-empty non-finite intermediate values', () => {
    const field = createNumberField(1)
    const props = bindNumberField(field)

    props.onChange(createNumberChangeEvent('-', Number.NaN))

    expect(field.onChange).not.toHaveBeenCalled()
  })
})
