// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { PriceBookStatusBadges } from '../components/price-book-status'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(() => {
  cleanup()
})

test('identifies the enabled TOC default price book in the status cell', () => {
  render(<PriceBookStatusBadges status='enabled' isTocDefault />)

  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(screen.getByText('TOC default')).toBeInTheDocument()
})

test('does not mark an ordinary enabled price book as the TOC default', () => {
  render(<PriceBookStatusBadges status='enabled' isTocDefault={false} />)

  expect(screen.getByText('Enabled')).toBeInTheDocument()
  expect(screen.queryByText('TOC default')).not.toBeInTheDocument()
})
