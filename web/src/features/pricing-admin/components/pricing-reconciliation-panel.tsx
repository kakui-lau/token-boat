import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  confirmPricingSnapshotRefunded,
  getPricingReconciliationSummary,
  getRequestPricingSnapshots,
} from '../api'

export function PricingReconciliationPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmRefundId, setConfirmRefundId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [billingModeFilter, setBillingModeFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const pageSize = 20
  const snapshotsQuery = useQuery({
    queryKey: [
      'pricing-admin',
      'request-pricing-snapshots',
      'pending',
      showAllRecords,
      statusFilter,
      billingModeFilter,
      appliedKeyword,
      page,
    ],
    queryFn: () =>
      getRequestPricingSnapshots({
        reconciliation: showAllRecords ? undefined : true,
        status: statusFilter
          ? (statusFilter as 'reserved' | 'pending' | 'settled' | 'refunded')
          : undefined,
        billing_mode: billingModeFilter || undefined,
        keyword: appliedKeyword || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: keepPreviousData,
  })
  const summaryQuery = useQuery({
    queryKey: ['pricing-admin', 'request-pricing-snapshots', 'summary'],
    queryFn: getPricingReconciliationSummary,
  })
  const confirmRefundMutation = useMutation({
    mutationFn: confirmPricingSnapshotRefunded,
    onSuccess: async () => {
      setConfirmRefundId(null)
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'request-pricing-snapshots'],
      })
    },
  })
  const rows = snapshotsQuery.data?.data.items ?? []
  const total = snapshotsQuery.data?.data.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const statusLabels = {
    pending: t('Pending'),
    reserved: t('Reserved'),
    settled: t('Settled'),
    refunded: t('Refunded'),
  }
  const exportParams = new URLSearchParams()
  if (!showAllRecords) {
    exportParams.set('reconciliation', 'true')
  }
  if (appliedKeyword) {
    exportParams.set('keyword', appliedKeyword)
  }
  if (statusFilter) {
    exportParams.set('status', statusFilter)
  }
  if (billingModeFilter) {
    exportParams.set('billing_mode', billingModeFilter)
  }
  const exportQuery = exportParams.toString()
  const exportUrl = `/api/pricing-admin/request-pricing-snapshots/export${exportQuery ? `?${exportQuery}` : ''}`

  return (
    <section className='space-y-3' aria-labelledby='pricing-reconciliation'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 id='pricing-reconciliation' className='font-medium'>
            {t('Billing Anomalies')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Shows settlement failures and reservations still incomplete after 15 minutes.'
            )}
          </p>
          <p className='text-muted-foreground text-sm'>
            {showAllRecords
              ? t('{{total}} pricing records', { total })
              : t('{{total}} billing anomalies', { total })}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            render={<a href={exportUrl} download />}
          >
            <Download aria-hidden='true' />
            {t('Export CSV')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={snapshotsQuery.isFetching || summaryQuery.isFetching}
            onClick={() => {
              void Promise.all([
                snapshotsQuery.refetch(),
                summaryQuery.refetch(),
              ])
            }}
          >
            <RefreshCw aria-hidden='true' />
            {t('Refresh')}
          </Button>
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          size='sm'
          variant={showAllRecords ? 'outline' : 'default'}
          onClick={() => {
            setShowAllRecords(false)
            setStatusFilter('')
            setPage(1)
          }}
        >
          {t('Anomalies only')}
        </Button>
        <Button
          size='sm'
          variant={showAllRecords ? 'default' : 'outline'}
          onClick={() => {
            setShowAllRecords(true)
            setPage(1)
          }}
        >
          {t('All pricing records')}
        </Button>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <NativeSelect
          size='sm'
          aria-label={t('Status')}
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value)
            setPage(1)
          }}
        >
          <NativeSelectOption value=''>{t('All statuses')}</NativeSelectOption>
          {(['reserved', 'pending', 'settled', 'refunded'] as const).map(
            (status) => (
              <NativeSelectOption key={status} value={status}>
                {statusLabels[status]}
              </NativeSelectOption>
            )
          )}
        </NativeSelect>
        <NativeSelect
          size='sm'
          aria-label={t('Billing mode')}
          value={billingModeFilter}
          onChange={(event) => {
            setBillingModeFilter(event.target.value)
            setPage(1)
          }}
        >
          <NativeSelectOption value=''>
            {t('All billing modes')}
          </NativeSelectOption>
          {[
            'token',
            'request',
            'image',
            'audio_duration',
            'video_duration',
            'character',
            'mixed',
          ].map((mode) => (
            <NativeSelectOption key={mode} value={mode}>
              {mode}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        {[
          {
            label: t('Pending anomalies'),
            value: summaryQuery.data?.data.pending ?? 0,
          },
          {
            label: t('Stale reservations'),
            value: summaryQuery.data?.data.stale_reserved ?? 0,
          },
          {
            label: t('Settled (24h)'),
            value: summaryQuery.data?.data.settled_last_24h ?? 0,
          },
          {
            label: t('Refunded (24h)'),
            value: summaryQuery.data?.data.refunded_last_24h ?? 0,
          },
          {
            label: t('Oldest anomaly'),
            value:
              (summaryQuery.data?.data.oldest_anomaly_created_at ?? 0) > 0
                ? dayjs
                    .unix(
                      summaryQuery.data?.data.oldest_anomaly_created_at ?? 0
                    )
                    .format('YYYY-MM-DD HH:mm')
                : '—',
          },
        ].map((item) => (
          <Card key={item.label} size='sm'>
            <CardContent>
              <div className='text-muted-foreground text-xs'>{item.label}</div>
              <div className='mt-1 font-mono text-lg font-semibold tabular-nums'>
                {item.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <form
        className='flex flex-wrap items-center gap-2'
        role='search'
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          setAppliedKeyword(keyword.trim())
        }}
      >
        <Input
          className='max-w-sm'
          aria-label={t('Search request ID, model, or channel')}
          placeholder={t('Search request ID, model, or channel')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Button type='submit' size='sm' variant='outline'>
          {t('Search')}
        </Button>
      </form>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Request ID')}</TableHead>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Channel')}</TableHead>
              <TableHead>{t('Billing mode')}</TableHead>
              <TableHead>{t('Reserved quota')}</TableHead>
              <TableHead>{t('Settled quota')}</TableHead>
              <TableHead>{t('Purchase cost')}</TableHead>
              <TableHead>{t('Retail amount')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Failure reason')}</TableHead>
              <TableHead>{t('Updated')}</TableHead>
              <TableHead>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className='max-w-56 truncate font-mono text-xs'>
                  {row.request_id}
                </TableCell>
                <TableCell>{row.model_name}</TableCell>
                <TableCell>{row.channel_name}</TableCell>
                <TableCell>
                  <Badge variant='outline'>{row.billing_mode}</Badge>
                </TableCell>
                <TableCell className='font-mono tabular-nums'>
                  {row.reserved_quota}
                </TableCell>
                <TableCell className='font-mono tabular-nums'>
                  {row.settled_quota}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                  {row.purchase_cost} {row.currency}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                  {row.retail_amount} {row.currency}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={row.status === 'pending' ? 'default' : 'secondary'}
                  >
                    {statusLabels[row.status]}
                  </Badge>
                </TableCell>
                <TableCell
                  className='max-w-72'
                  title={row.failure_reason || undefined}
                >
                  <div className='truncate'>
                    {row.failure_reason || row.failure_code || '—'}
                  </div>
                  {row.failure_code ? (
                    <div className='text-muted-foreground font-mono text-xs'>
                      {row.failure_code}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {dayjs.unix(row.updated_at).format('YYYY-MM-DD HH:mm')}
                </TableCell>
                <TableCell>
                  {row.status === 'pending' ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setConfirmRefundId(row.id)}
                    >
                      {t('Confirm Refunded')}
                    </Button>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!snapshotsQuery.isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className='text-muted-foreground h-20 text-center'
                >
                  {t('No billing anomalies')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {total > pageSize ? (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-muted-foreground text-sm'>
            {t('Page {{page}} of {{total}}', {
              page,
              total: totalPages,
            })}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={page === 1 || snapshotsQuery.isFetching}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              <ChevronLeft aria-hidden='true' />
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={page >= totalPages || snapshotsQuery.isFetching}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              {t('Next')}
              <ChevronRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRefundId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRefundId(null)
          }
        }}
        title={t('Confirm this request as refunded?')}
        desc={t(
          'Only continue after verifying the request log and quota ledger. This records an existing refund and does not issue another refund.'
        )}
        confirmText={t('Confirm Refunded')}
        isLoading={confirmRefundMutation.isPending}
        handleConfirm={() => {
          if (confirmRefundId !== null) {
            confirmRefundMutation.mutate(confirmRefundId)
          }
        }}
      />
    </section>
  )
}
