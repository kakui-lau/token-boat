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
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getPricingChangeBatch,
  getPricingChangeBatches,
  publishGeneratedPricingChangeBatch,
  reconcilePricingAutomation,
} from '../api'
import type { PricingChangeBatch } from '../types'
import { ListPagination } from './list-pagination'

function triggerLabel(trigger: string, t: TFunction) {
  if (trigger === 'official_price_publish') {
    return t('Official price published')
  }
  if (trigger === 'purchase_price_publish') {
    return t('Purchase price published')
  }
  if (trigger === 'manual_price_book_generation') {
    return t('Manual price generation')
  }
  return trigger
}

function percent(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${(parsed * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

export function ChangeBatchesPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<PricingChangeBatch['status'] | ''>('')
  const [triggerType, setTriggerType] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedBatchId, setSelectedBatchId] = useState<number>()
  const deferredKeyword = useDeferredValue(keyword)
  const batchesQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'change-batches',
      deferredKeyword,
      status,
      triggerType,
      page,
      pageSize,
    ],
    queryFn: () =>
      getPricingChangeBatches({
        keyword: deferredKeyword.trim() || undefined,
        status: status || undefined,
        trigger_type: triggerType || undefined,
        p: page,
        page_size: pageSize,
      }),
    placeholderData: keepPreviousData,
  })
  const batches = batchesQuery.data?.data.items ?? []
  const selectedBatch =
    batches.find((batch) => batch.id === selectedBatchId) ?? batches[0]
  const detailQuery = useQuery({
    queryKey: ['sales-price-books', 'change-batch', selectedBatch?.id ?? 0],
    queryFn: () => getPricingChangeBatch(selectedBatch?.id ?? 0),
    enabled: Boolean(selectedBatch),
  })
  const details = detailQuery.data?.data.items ?? []
  const reconcileMutation = useMutation({
    mutationFn: reconcilePricingAutomation,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'change-batches'],
      })
      toast.success(
        t('{{count}} pricing automation gaps repaired', {
          count:
            response.data.official_gaps_repaired +
            response.data.purchase_gaps_repaired,
        })
      )
    },
    onError: handleServerError,
  })
  const publishMutation = useMutation({
    mutationFn: publishGeneratedPricingChangeBatch,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books'],
      })
      toast.success(
        t('{{purchase}} purchase and {{sales}} sales versions published', {
          purchase: response.data.purchase_versions_published,
          sales: response.data.sales_versions_published,
        })
      )
    },
    onError: handleServerError,
  })

  return (
    <div className='flex flex-col gap-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Pricing change batches')}</CardTitle>
          <CardDescription>
            {t('Track automatic and manual price recalculation history.')}
          </CardDescription>
          <CardAction>
            <Button
              size='sm'
              variant='outline'
              disabled={reconcileMutation.isPending}
              onClick={() => reconcileMutation.mutate()}
            >
              {t('Repair automation gaps')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <div className='grid gap-3 md:grid-cols-[minmax(260px,1fr)_200px_220px]'>
            <Input
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value)
                setPage(1)
              }}
              placeholder={t('Search batch number')}
              aria-label={t('Search batch number')}
            />
            <NativeSelect
              aria-label={t('Status')}
              value={status}
              onChange={(event) => {
                setStatus(
                  event.target.value as PricingChangeBatch['status'] | ''
                )
                setPage(1)
              }}
            >
              <NativeSelectOption value=''>
                {t('All statuses')}
              </NativeSelectOption>
              <NativeSelectOption value='completed'>
                {t('Completed')}
              </NativeSelectOption>
              <NativeSelectOption value='review_required'>
                {t('Requires review')}
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              aria-label={t('Trigger type')}
              value={triggerType}
              onChange={(event) => {
                setTriggerType(event.target.value)
                setPage(1)
              }}
            >
              <NativeSelectOption value=''>
                {t('All trigger types')}
              </NativeSelectOption>
              <NativeSelectOption value='official_price_publish'>
                {t('Official price published')}
              </NativeSelectOption>
              <NativeSelectOption value='purchase_price_publish'>
                {t('Purchase price published')}
              </NativeSelectOption>
              <NativeSelectOption value='manual_price_book_generation'>
                {t('Manual price generation')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {batchesQuery.isLoading ? <Skeleton className='h-40 w-full' /> : null}
          {batches.length > 0 ? (
            <div className='overflow-x-auto'>
              <Table className='min-w-[76rem]'>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Batch number')}</TableHead>
                    <TableHead>{t('Trigger type')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Total')}</TableHead>
                    <TableHead>{t('Changed')}</TableHead>
                    <TableHead>{t('Unchanged')}</TableHead>
                    <TableHead>{t('Requires review')}</TableHead>
                    <TableHead>{t('Requested by')}</TableHead>
                    <TableHead>{t('Created at')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow
                      key={batch.id}
                      className='cursor-pointer'
                      data-state={
                        selectedBatch?.id === batch.id ? 'selected' : undefined
                      }
                      onClick={() => setSelectedBatchId(batch.id)}
                    >
                      <TableCell className='font-mono text-xs'>
                        {batch.batch_no}
                      </TableCell>
                      <TableCell>
                        {triggerLabel(batch.trigger_type, t)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.review_count > 0 ? 'warning' : 'outline'
                          }
                        >
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.total_count}</TableCell>
                      <TableCell>{batch.changed_count}</TableCell>
                      <TableCell>{batch.unchanged_count}</TableCell>
                      <TableCell>{batch.review_count}</TableCell>
                      <TableCell>
                        {batch.requested_by_username ||
                          batch.requested_by ||
                          '—'}
                      </TableCell>
                      <TableCell>
                        {new Date(batch.created_at * 1000).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {!batchesQuery.isLoading && batches.length === 0 ? (
            <Empty className='min-h-32'>
              <EmptyHeader>
                <EmptyTitle>{t('No pricing change batches')}</EmptyTitle>
                <EmptyDescription>
                  {t('No batches match the current filters.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {!batchesQuery.isLoading ? (
            <ListPagination
              page={page}
              pageSize={pageSize}
              total={batchesQuery.data?.data.total ?? 0}
              isFetching={batchesQuery.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      {selectedBatch ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('Batch details')}</CardTitle>
            <CardDescription>{selectedBatch.batch_no}</CardDescription>
            <CardAction>
              <Button
                size='sm'
                disabled={
                  publishMutation.isPending || selectedBatch.review_count > 0
                }
                onClick={() => publishMutation.mutate(selectedBatch.id)}
              >
                {t('Publish generated versions')}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {detailQuery.isLoading ? (
              <Skeleton className='h-40 w-full' />
            ) : null}
            {details.length > 0 ? (
              <div className='overflow-x-auto'>
                <Table className='min-w-[96rem]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Model Name')}</TableHead>
                      <TableHead>{t('Target')}</TableHead>
                      <TableHead>{t('Channel')}</TableHead>
                      <TableHead>{t('Sales price book')}</TableHead>
                      <TableHead>{t('Action')}</TableHead>
                      <TableHead>{t('Old reference price')}</TableHead>
                      <TableHead>{t('New reference price')}</TableHead>
                      <TableHead>{t('Old reference cost')}</TableHead>
                      <TableHead>{t('New reference cost')}</TableHead>
                      <TableHead>{t('Margin before')}</TableHead>
                      <TableHead>{t('Margin after')}</TableHead>
                      <TableHead>{t('Risk')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className='font-medium'>
                          {item.model_name || item.model_id}
                        </TableCell>
                        <TableCell>{item.target_type}</TableCell>
                        <TableCell>
                          {item.channel_name || item.channel_model_id || '—'}
                        </TableCell>
                        <TableCell>
                          {item.price_book_name || item.price_book_id || '—'}
                        </TableCell>
                        <TableCell>{item.action}</TableCell>
                        <TableCell>{item.old_reference_price || '—'}</TableCell>
                        <TableCell>{item.new_reference_price || '—'}</TableCell>
                        <TableCell>{item.old_reference_cost || '—'}</TableCell>
                        <TableCell>{item.new_reference_cost || '—'}</TableCell>
                        <TableCell>{percent(item.margin_before)}</TableCell>
                        <TableCell>{percent(item.margin_after)}</TableCell>
                        <TableCell className='max-w-80 whitespace-normal'>
                          {item.risk_code || item.error_message || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            {!detailQuery.isLoading && details.length === 0 ? (
              <Empty className='min-h-32'>
                <EmptyHeader>
                  <EmptyTitle>{t('No pricing change details')}</EmptyTitle>
                  <EmptyDescription>
                    {t('This batch did not produce model-level changes.')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
