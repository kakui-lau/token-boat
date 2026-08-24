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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const

type ListPaginationProps = {
  page: number
  pageSize: number
  total: number
  isFetching: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function ListPagination(props: ListPaginationProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))

  return (
    <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-muted-foreground text-sm'>
        {t('{{total}} records match the current filters.', {
          total: props.total,
        })}
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-muted-foreground text-sm'>
          {t('Rows per page')}
        </span>
        <NativeSelect
          className='h-8 w-[72px]'
          aria-label={t('Rows per page')}
          value={String(props.pageSize)}
          onChange={(event) =>
            props.onPageSizeChange(Number(event.target.value))
          }
        >
          {PAGE_SIZE_OPTIONS.map((pageSize) => (
            <NativeSelectOption key={pageSize} value={String(pageSize)}>
              {pageSize}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          size='sm'
          variant='outline'
          disabled={props.page <= 1 || props.isFetching}
          onClick={() => props.onPageChange(props.page - 1)}
        >
          {t('Previous')}
        </Button>
        <span className='text-sm'>
          {t('Page {{page}} of {{total}}', {
            page: props.page,
            total: totalPages,
          })}
        </span>
        <Button
          size='sm'
          variant='outline'
          disabled={props.page >= totalPages || props.isFetching}
          onClick={() => props.onPageChange(props.page + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}
