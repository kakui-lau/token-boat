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
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableRow } from '@/components/ui/table'

type SelectablePriceBookRowProps = {
  children: ReactNode
  selected: boolean
  onSelect: () => void
}

const interactiveSelector =
  'button, a, input, select, textarea, [role="button"], [role="link"]'

function SelectablePriceBookRow(props: SelectablePriceBookRowProps) {
  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest(interactiveSelector)
    ) {
      return
    }
    props.onSelect()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    props.onSelect()
  }

  return (
    <TableRow
      data-state={props.selected ? 'selected' : undefined}
      aria-selected={props.selected}
      tabIndex={0}
      className='focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)]'
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {props.children}
    </TableRow>
  )
}

type PriceBookSelectionActionProps = {
  selected: boolean
  onSelect: () => void
}

function PriceBookSelectionAction(props: PriceBookSelectionActionProps) {
  const { t } = useTranslation()

  if (props.selected) {
    return (
      <Badge variant='secondary' aria-current='true'>
        {t('Viewing')}
      </Badge>
    )
  }

  return (
    <Button size='sm' onClick={props.onSelect}>
      {t('View details')}
    </Button>
  )
}

export { PriceBookSelectionAction, SelectablePriceBookRow }
