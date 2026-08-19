/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  Sorting01Icon,
  SortingDownIcon,
  SortingUpIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import type { ChannelUsageSortBy, ChannelUsageSortOrder } from '../types'

type SortableUsageTableHeadProps = {
  label: string
  sortBy: ChannelUsageSortBy
  activeSortBy: ChannelUsageSortBy
  sortOrder: ChannelUsageSortOrder
  align?: 'left' | 'right'
  onSort: (sortBy: ChannelUsageSortBy) => void
}

export function SortableUsageTableHead(props: SortableUsageTableHeadProps) {
  const { t } = useTranslation()
  const active = props.activeSortBy === props.sortBy
  const direction = active ? props.sortOrder : undefined
  const directionLabel = direction
    ? t(direction === 'asc' ? 'Ascending' : 'Descending')
    : t('Not sorted')
  let icon = Sorting01Icon
  if (direction === 'asc') {
    icon = SortingUpIcon
  } else if (direction === 'desc') {
    icon = SortingDownIcon
  }

  return (
    <TableHead
      aria-sort={direction ? `${direction}ending` : 'none'}
      className={cn(props.align === 'right' && 'text-right')}
    >
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className={cn(
          '-mx-2',
          props.align === 'right' && 'ml-auto',
          active && 'text-foreground'
        )}
        aria-label={`${props.label}: ${directionLabel}`}
        onClick={() => props.onSort(props.sortBy)}
      >
        {props.label}
        <HugeiconsIcon icon={icon} strokeWidth={2} data-icon='inline-end' />
      </Button>
    </TableHead>
  )
}
