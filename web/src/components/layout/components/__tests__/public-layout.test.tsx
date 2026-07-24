// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { PublicLayout } from '../public-layout'

vi.mock('../public-header', () => ({
  PublicHeader: () => <header>Public header</header>,
}))

vi.mock('../footer', () => ({
  Footer: () => <footer>Public footer</footer>,
}))

describe('PublicLayout footer', () => {
  afterEach(cleanup)

  test('renders the footer after public page content in normal document flow', () => {
    render(
      <PublicLayout>
        <div>Page content</div>
      </PublicLayout>
    )

    const content = screen.getByText('Page content')
    const footer = screen.getByRole('contentinfo')

    expect(content.compareDocumentPosition(footer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
    expect(footer).not.toHaveClass('fixed', 'sticky')
  })
})
