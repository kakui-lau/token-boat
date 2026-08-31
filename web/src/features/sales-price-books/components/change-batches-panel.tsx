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
import { useDeferredValue, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Spinner } from '@/components/ui/spinner'
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
import { pricingRiskLabel } from '../lib/pricing-risk'
import type { PricingChangeBatch } from '../types'
import { ListPagination } from './list-pagination'
import { TableRecordCount } from './table-record-count'

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
  if (trigger === 'manual_price_book_edit') {
    return t('Manual price edit')
  }
  if (trigger === 'channel_model_policy_change') {
    return t('Channel model special parameters changed')
  }
  return trigger
}

function batchStatusLabel(status: PricingChangeBatch['status'], t: TFunction) {
  return status === 'completed' ? t('Completed') : t('Requires review')
}

function targetLabel(target: string, t: TFunction) {
  return target === 'sales_price_book_item'
    ? t('Model sales price')
    : t('Purchase price version')
}

function referenceAmount(value: string | undefined) {
  if (!value) return '—'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return value
  return parsed.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function actionLabel(action: string, t: TFunction) {
  const labels: Record<string, string> = {
    added: t('Added'),
    changed: t('Changed'),
    unchanged: t('Unchanged'),
    removed: t('Removed'),
  }
  return labels[action] ?? action
}

type ChangeBatchesPanelProps = {
  canWrite?: boolean
  canPublish?: boolean
}

function percent(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${(parsed * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

export function ChangeBatchesPanel(props: ChangeBatchesPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<PricingChangeBatch['status'] | ''>('')
  const [triggerType, setTriggerType] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedBatchId, setSelectedBatchId] = useState<number>()
  const [publishCandidate, setPublishCandidate] = useState<PricingChangeBatch>()
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(200)
  const canWrite = props.canWrite ?? true
  const canPublish = props.canPublish ?? true
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
  const detailPageCount = Math.max(
    1,
    Math.ceil(details.length / detailPageSize)
  )
  const visibleDetailPage = Math.min(detailPage, detailPageCount)
  const pagedDetails = details.slice(
    (visibleDetailPage - 1) * detailPageSize,
    visibleDetailPage * detailPageSize
  )
  useEffect(() => {
    setDetailPage(1)
  }, [selectedBatch?.id])
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
      setPublishCandidate(undefined)
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
          {canWrite ? (
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
          ) : null}
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
              <NativeSelectOption value='manual_price_book_edit'>
                {t('Manual price edit')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {batchesQuery.isLoading ? <Skeleton className='h-40 w-full' /> : null}
          {batches.length > 0 ? (
            <div className='overflow-x-auto'>
              <Table className='min-w-[76rem]'>
                <TableHeader>
                  <TableRow>
                    <TableHead className='bg-card sticky left-0 z-10'>
                      {t('Batch number')}
                    </TableHead>
                    <TableHead>{t('Trigger type')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('Total')}</TableHead>
                    <TableHead>{t('Changed')}</TableHead>
                    <TableHead>{t('Unchanged')}</TableHead>
                    <TableHead>{t('Requires review')}</TableHead>
                    <TableHead>{t('Requested by')}</TableHead>
                    <TableHead>{t('Created at')}</TableHead>
                    <TableHead>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow
                      key={batch.id}
                      data-state={
                        selectedBatch?.id === batch.id ? 'selected' : undefined
                      }
                    >
                      <TableCell className='bg-card sticky left-0 z-10 font-mono text-xs'>
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
                          {batchStatusLabel(batch.status, t)}
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
                      <TableCell>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setSelectedBatchId(batch.id)}
                        >
                          {selectedBatch?.id === batch.id
                            ? t('Viewing')
                            : t('View details')}
                        </Button>
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
            {canPublish ? (
              <CardAction>
                <Button
                  size='sm'
                  disabled={
                    publishMutation.isPending || selectedBatch.review_count > 0
                  }
                  onClick={() => setPublishCandidate(selectedBatch)}
                >
                  {t('Publish generated versions')}
                </Button>
              </CardAction>
            ) : null}
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
                      <TableHead className='bg-card sticky left-0 z-10'>
                        {t('Model Name')}
                      </TableHead>
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
                    {pagedDetails.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className='bg-card sticky left-0 z-10 font-medium'>
                          {item.model_name || item.model_id}
                        </TableCell>
                        <TableCell>
                          {targetLabel(item.target_type, t)}
                        </TableCell>
                        <TableCell>
                          {item.channel_name || item.channel_model_id || '—'}
                        </TableCell>
                        <TableCell>
                          {item.price_book_name || item.price_book_id || '—'}
                        </TableCell>
                        <TableCell>{actionLabel(item.action, t)}</TableCell>
                        <TableCell>
                          {referenceAmount(item.old_reference_price)}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(item.new_reference_price)}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(item.old_reference_cost)}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(item.new_reference_cost)}
                        </TableCell>
                        <TableCell>{percent(item.margin_before)}</TableCell>
                        <TableCell>{percent(item.margin_after)}</TableCell>
                        <TableCell className='max-w-80 whitespace-normal'>
                          {item.risk_code ? (
                            <div className='flex flex-col gap-1'>
                              <span>{pricingRiskLabel(item.risk_code, t)}</span>
                              <code className='text-muted-foreground text-xs'>
                                {item.risk_code}
                              </code>
                            </div>
                          ) : (
                            item.error_message || '—'
                          )}
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
            {!detailQuery.isLoading ? (
              <div className='mt-4'>
                <div className='flex flex-col gap-2'>
                  <TableRecordCount total={details.length} />
                  <ListPagination
                    page={visibleDetailPage}
                    pageSize={detailPageSize}
                    total={details.length}
                    isFetching={detailQuery.isFetching}
                    showRecordCount={false}
                    onPageChange={setDetailPage}
                    onPageSizeChange={(value) => {
                      setDetailPageSize(value)
                      setDetailPage(1)
                    }}
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <AlertDialog
        open={Boolean(publishCandidate)}
        onOpenChange={(open) => {
          if (!open && !publishMutation.isPending) {
            setPublishCandidate(undefined)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Publish generated pricing versions')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Batch {{batch}} contains {{changed}} changed items and will publish generated purchase and sales versions. This may immediately affect customer billing.',
                {
                  batch: publishCandidate?.batch_no ?? '',
                  changed: publishCandidate?.changed_count ?? 0,
                }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={publishMutation.isPending || !publishCandidate}
              onClick={(event) => {
                event.preventDefault()
                if (publishCandidate) {
                  publishMutation.mutate(publishCandidate.id)
                }
              }}
            >
              {publishMutation.isPending ? (
                <Spinner data-icon='inline-start' />
              ) : null}
              {t('Publish and apply')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
