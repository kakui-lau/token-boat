// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { Table, TableBody, TableCell, TableRow } from '../table'

describe('Table surface', () => {
  afterEach(cleanup)

  test('gives table content a translucent themed surface', () => {
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>Visible row</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    expect(screen.getByText('Visible row').closest('tbody')).toHaveClass(
      'bg-(--table-row)'
    )
  })
})
