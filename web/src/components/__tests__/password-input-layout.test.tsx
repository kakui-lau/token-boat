// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { PasswordInput } from '../password-input'

describe('PasswordInput layout', () => {
  afterEach(cleanup)

  test('applies sizing classes to the input instead of shrinking it inside the wrapper', () => {
    render(
      <PasswordInput aria-label='Password' className='h-10 rounded-xl px-3.5' />
    )

    const input = screen.getByLabelText('Password')

    expect(input).toHaveClass('h-10', 'rounded-xl', 'px-3.5', 'pe-9')
    expect(input.parentElement).toHaveClass('relative')
    expect(input.parentElement).not.toHaveClass('px-3.5')
  })
})
