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
