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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getSalesPriceBookAuditRecords } from '../api'
import { ListPagination } from './list-pagination'
import { TableRecordCount } from './table-record-count'

function auditActionLabel(action: string, t: TFunction) {
  const labels: Record<string, string> = {
    create: t('Created price book'),
    update: t('Updated price book'),
    create_version: t('Created draft version'),
    delete_draft: t('Delete draft'),
    edit_policy: t('Updated pricing parameters'),
    generate_items: t('Generated model prices'),
    generate: t('Generated model prices'),
    create_item: t('Created model price'),
    edit_item: t('Edited model price'),
    manual_edit: t('Edited model price'),
    delete_item: t('Deleted model price'),
    accept_review: t('Accepted pricing risk'),
    reject_review: t('Rejected pricing risk'),
    accept_risk: t('Accepted pricing risk'),
    reject_risk: t('Rejected pricing risk'),
    review: t('Reviewed pricing risk'),
    clone: t('Historical version restored as a new draft'),
    enable_item: t('Enabled model price'),
    disable_item: t('Disabled model price'),
    publish: t('Published version'),
    disable: t('Disabled price book'),
    enable: t('Enabled price book'),
    archive: t('Archived price book'),
    assign: t('Assign user'),
    cancel: t('Cancel assignment'),
    set_default: t('TOC default'),
    save_channel_model_override: t('Updated pricing parameters'),
    delete_channel_model_override: t('Updated pricing parameters'),
  }
  return labels[action] ?? action
}

function auditObjectLabel(objectType: string, t: TFunction) {
  if (objectType === 'sales_price_book') return t('Price book')
  if (objectType === 'sales_price_book_version') return t('Pricing version')
  if (objectType === 'sales_price_book_item') return t('Model sales price')
  if (objectType === 'user_price_book_assignment') return t('User assignments')
  if (objectType === 'sales_price_book_default') return t('TOC default')
  if (objectType === 'pricing_change_batch') return t('Pricing change batches')
  return objectType
}

export function PriceBookAuditPanel(props: { priceBookId: number }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const query = useQuery({
    queryKey: [
      'sales-price-books',
      'audit-records',
      props.priceBookId,
      page,
      pageSize,
    ],
    queryFn: () =>
      getSalesPriceBookAuditRecords(props.priceBookId, page, pageSize),
    placeholderData: keepPreviousData,
  })
  const records = query.data?.data.items ?? []
  const total = query.data?.data.total ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Price book activity')}</CardTitle>
        <CardDescription>
          {t('Review who changed pricing, what changed, and when it happened.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {query.isLoading ? <Skeleton className='h-32 w-full' /> : null}
        {!query.isLoading && records.length === 0 ? (
          <Empty className='min-h-32'>
            <EmptyHeader>
              <EmptyTitle>{t('No price book activity yet')}</EmptyTitle>
              <EmptyDescription>
                {t('Pricing changes and review decisions will appear here.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {records.length > 0 ? (
          <Table className='min-w-[64rem]'>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Time')}</TableHead>
                <TableHead>{t('Operator')}</TableHead>
                <TableHead>{t('Action')}</TableHead>
                <TableHead>{t('Object')}</TableHead>
                <TableHead>{t('Comment')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    {new Date(record.created_at * 1000).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {record.operator_username || `#${record.operator_id}`}
                  </TableCell>
                  <TableCell>{auditActionLabel(record.action, t)}</TableCell>
                  <TableCell>
                    {auditObjectLabel(record.object_type, t)} #
                    {record.object_id}
                  </TableCell>
                  <TableCell className='max-w-96 whitespace-normal'>
                    {record.comment || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {!query.isLoading ? (
          <div className='flex flex-col gap-2'>
            <TableRecordCount total={total} />
            <ListPagination
              page={page}
              pageSize={pageSize}
              total={total}
              isFetching={query.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
