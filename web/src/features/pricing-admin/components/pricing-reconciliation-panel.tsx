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
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { useAuthStore } from '@/stores/auth-store'

import {
  confirmPricingSnapshotRefunded,
  getPricingFinancialSummary,
  getPricingReconciliationSummary,
  getRequestPricingSnapshots,
  recordPricingSnapshotProviderCost,
} from '../api'

function formatPricingUsage(value?: string): string {
  if (!value) return '—'
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

const providerCostStatusLabel = {
  estimated: 'Estimate only',
  pending: 'Pending reconciliation',
  confirmed: 'Confirmed',
  reconciled: 'Reconciled',
  failed: 'Sync failed',
} as const

const providerCostModeLabel = {
  estimated: 'Estimated from purchase price',
  response_reported: 'Reported in upstream response',
  provider_api: 'Provider billing API',
  invoice: 'Invoice reconciliation',
  manual: 'Manual reconciliation',
} as const

const providerCostSourceLabel = {
  response: 'Upstream response',
  task_response: 'Task response',
  provider_api: 'Provider billing API',
  invoice: 'Supplier invoice',
  manual: 'Manual entry',
  legacy: 'Legacy record',
} as const

export function PricingReconciliationPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const canOperate = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING_GOVERNANCE,
    ADMIN_PERMISSION_ACTIONS.OPERATE
  )
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING_GOVERNANCE,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const [confirmRefundId, setConfirmRefundId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [billingModeFilter, setBillingModeFilter] = useState('')
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(
    null
  )
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [providerCost, setProviderCost] = useState('')
  const [providerCostScope, setProviderCostScope] = useState<
    'full_provider_cost' | 'platform_fee_only'
  >('full_provider_cost')
  const pageSize = 20
  const snapshotsQuery = useQuery({
    queryKey: [
      'pricing-admin',
      'request-pricing-snapshots',
      'pending',
      showAllRecords,
      statusFilter,
      billingModeFilter,
      createdFrom,
      createdTo,
      appliedKeyword,
      page,
    ],
    queryFn: () =>
      getRequestPricingSnapshots({
        reconciliation: showAllRecords ? undefined : true,
        status: statusFilter
          ? (statusFilter as
              | 'reserved'
              | 'pending'
              | 'settled'
              | 'refunded'
              | 'archived')
          : undefined,
        billing_mode: billingModeFilter || undefined,
        created_from: createdFrom ? dayjs(createdFrom).unix() : undefined,
        created_to: createdTo ? dayjs(createdTo).unix() : undefined,
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
  const financialSummaryQuery = useQuery({
    queryKey: [
      'pricing-admin',
      'request-pricing-snapshots',
      'financial-summary',
      createdFrom,
      createdTo,
    ],
    queryFn: () =>
      getPricingFinancialSummary({
        created_from: createdFrom ? dayjs(createdFrom).unix() : undefined,
        created_to: createdTo ? dayjs(createdTo).unix() : undefined,
      }),
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
  const providerCostMutation = useMutation({
    mutationFn: (input: {
      id: number
      cost: string
      scope: 'full_provider_cost' | 'platform_fee_only'
    }) =>
      recordPricingSnapshotProviderCost(input.id, {
        cost: input.cost,
        scope: input.scope,
      }),
    onSuccess: async () => {
      setProviderCost('')
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'request-pricing-snapshots'],
      })
    },
  })
  const rows = snapshotsQuery.data?.data.items ?? []
  const selectedSnapshot =
    rows.find((row) => row.id === selectedSnapshotId) ?? null
  const total = snapshotsQuery.data?.data.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const statusLabels = {
    pending: t('Pending'),
    reserved: t('Reserved'),
    settled: t('Settled'),
    refunded: t('Refunded'),
    archived: t('Archived'),
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
  if (createdFrom) {
    exportParams.set('created_from', String(dayjs(createdFrom).unix()))
  }
  if (createdTo) {
    exportParams.set('created_to', String(dayjs(createdTo).unix()))
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
          {canExport ? (
            <Button
              size='sm'
              variant='outline'
              render={<a href={exportUrl} download />}
            >
              <Download aria-hidden='true' />
              {t('Export CSV')}
            </Button>
          ) : null}
          <Button
            size='sm'
            variant='outline'
            disabled={
              snapshotsQuery.isFetching ||
              summaryQuery.isFetching ||
              financialSummaryQuery.isFetching
            }
            onClick={() => {
              void Promise.all([
                snapshotsQuery.refetch(),
                summaryQuery.refetch(),
                financialSummaryQuery.refetch(),
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
          {(
            ['reserved', 'pending', 'settled', 'refunded', 'archived'] as const
          ).map(
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
        <Input
          className='w-auto'
          type='datetime-local'
          aria-label={t('Created from')}
          value={createdFrom}
          onChange={(event) => {
            setCreatedFrom(event.target.value)
            setPage(1)
          }}
        />
        <Input
          className='w-auto'
          type='datetime-local'
          aria-label={t('Created to')}
          value={createdTo}
          onChange={(event) => {
            setCreatedTo(event.target.value)
            setPage(1)
          }}
        />
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
            label: t('Archived (24h)'),
            value: summaryQuery.data?.data.archived_last_24h ?? 0,
          },
          {
            label: t('Requires manual review'),
            value: summaryQuery.data?.data.manual_review ?? 0,
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
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6'>
        {[
          {
            label: t('Billed Amount'),
            value:
              (financialSummaryQuery.data?.data.customer_charge_known_count ??
              0)
                ? (financialSummaryQuery.data?.data.billed_amount_usd ??
                  financialSummaryQuery.data?.data.revenue_usd ??
                  '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.customer_charge_known_count ??
                0) > 0,
          },
          {
            label: t('Settled estimated purchase cost'),
            value:
              (financialSummaryQuery.data?.data.finalized_count ?? 0)
                ? (financialSummaryQuery.data?.data.estimated_purchase_usd ??
                  '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.finalized_count ?? 0) > 0,
          },
          {
            label: t('Refunded estimated cost exposure'),
            value:
              (financialSummaryQuery.data?.data.refunded_count ?? 0) > 0
                ? (financialSummaryQuery.data?.data
                    .refunded_estimated_purchase_usd ?? '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.refunded_count ?? 0) > 0,
          },
          {
            label: t('Confirmed provider cost'),
            value:
              (financialSummaryQuery.data?.data.provider_cost_known_count ?? 0)
                ? (financialSummaryQuery.data?.data
                    .provider_reported_cost_usd ?? '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.provider_cost_known_count ??
                0) > 0,
          },
          {
            label: t('Cost variance'),
            value:
              (financialSummaryQuery.data?.data.provider_cost_known_count ?? 0)
                ? (financialSummaryQuery.data?.data.cost_variance_usd ?? '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.provider_cost_known_count ??
                0) > 0,
          },
          {
            label: t('Gross margin'),
            value:
              (financialSummaryQuery.data?.data.gross_margin_known_count ?? 0)
                ? (financialSummaryQuery.data?.data.gross_margin_usd ?? '0')
                : '—',
            isCurrency:
              (financialSummaryQuery.data?.data.gross_margin_known_count ?? 0) >
              0,
          },
          {
            label: t('Estimate-only records'),
            value:
              financialSummaryQuery.data?.data.provider_cost_estimated_count ??
              0,
            isCurrency: false,
          },
          {
            label: t('Pending cost reconciliation'),
            value:
              financialSummaryQuery.data?.data.provider_cost_pending_count ??
              financialSummaryQuery.data?.data.provider_cost_missing_count ??
              0,
            isCurrency: false,
          },
          {
            label: t('Confirmed cost records'),
            value:
              financialSummaryQuery.data?.data.provider_cost_confirmed_count ??
              financialSummaryQuery.data?.data.provider_cost_known_count ??
              0,
            isCurrency: false,
          },
          {
            label: t('Cost sync failures'),
            value:
              financialSummaryQuery.data?.data.provider_cost_failed_count ?? 0,
            isCurrency: false,
          },
          {
            label: t('Missing charge snapshots'),
            value:
              financialSummaryQuery.data?.data.customer_charge_missing_count ??
              0,
            isCurrency: false,
          },
          {
            label: t('Margin breaches'),
            value: financialSummaryQuery.data?.data.margin_breach_count ?? 0,
            isCurrency: false,
          },
        ].map((item) => (
          <Card key={item.label} size='sm'>
            <CardContent>
              <div className='text-muted-foreground text-xs'>{item.label}</div>
              <div className='mt-1 font-mono text-lg font-semibold tabular-nums'>
                {item.value}
                {item.isCurrency ? ' USD' : ''}
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
          aria-label={t(
            'Search request ID, upstream request ID, model, or channel'
          )}
          placeholder={t(
            'Search request ID, upstream request ID, model, or channel'
          )}
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
              <TableHead>{t('Upstream Request ID')}</TableHead>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Channel')}</TableHead>
              <TableHead>{t('Billing mode')}</TableHead>
              <TableHead>{t('Reserved quota')}</TableHead>
              <TableHead>{t('Settled quota')}</TableHead>
              <TableHead>{t('Purchase cost')}</TableHead>
              <TableHead>{t('Provider reported cost')}</TableHead>
              <TableHead>{t('Cost variance')}</TableHead>
              <TableHead>{t('Gross margin')}</TableHead>
              <TableHead>{t('Base retail amount')}</TableHead>
              <TableHead>{t('Estimated charge')}</TableHead>
              <TableHead>{t('Billed Amount')}</TableHead>
              <TableHead>{t('Effective group')}</TableHead>
              <TableHead>{t('Net Margin')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Failure reason')}</TableHead>
              <TableHead>{t('Updated')}</TableHead>
              <TableHead>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              let providerCostDisplay = '—'
              if (row.provider_cost_known) {
                providerCostDisplay = `${row.provider_reported_cost} ${row.currency}`
              } else if (row.provider_cost_status) {
                providerCostDisplay = t(
                  providerCostStatusLabel[row.provider_cost_status]
                )
              }
              return (
                <TableRow key={row.id}>
                  <TableCell className='max-w-56 truncate font-mono text-xs'>
                    {row.request_id}
                  </TableCell>
                  <TableCell
                    className='max-w-56 truncate font-mono text-xs'
                    title={row.upstream_request_id || undefined}
                  >
                    {row.upstream_request_id || '—'}
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
                    {providerCostDisplay}
                  </TableCell>
                  <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                    {row.provider_cost_known
                      ? `${row.cost_variance} ${row.currency}`
                      : '—'}
                  </TableCell>
                  <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                    {row.gross_margin_known
                      ? `${row.gross_margin} ${row.currency}`
                      : '—'}
                  </TableCell>
                  <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                    {row.base_retail_amount || row.retail_amount} {row.currency}
                  </TableCell>
                  <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                    {row.estimated_customer_charge
                      ? `${row.estimated_customer_charge} ${row.currency}`
                      : '—'}
                  </TableCell>
                  <TableCell className='font-mono whitespace-nowrap tabular-nums'>
                    {row.customer_charge
                      ? `${row.customer_charge} ${row.currency}`
                      : '—'}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {row.applied_group || '—'}
                    {row.applied_group_ratio
                      ? ` · ×${row.applied_group_ratio}`
                      : ''}
                  </TableCell>
                  <TableCell
                    className={
                      row.net_margin_rate && row.margin_compliant === false
                        ? 'text-destructive font-mono whitespace-nowrap tabular-nums'
                        : 'font-mono whitespace-nowrap tabular-nums'
                    }
                  >
                    {row.net_margin_rate
                      ? `${(Number(row.net_margin_rate) * 100).toFixed(2)}%`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === 'pending' ? 'default' : 'secondary'
                      }
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
                    <div className='flex items-center gap-2'>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() =>
                          setSelectedSnapshotId(
                            selectedSnapshotId === row.id ? null : row.id
                          )
                        }
                      >
                        {t('View details')}
                      </Button>
                      {canOperate &&
                      row.status === 'pending' &&
                      row.pre_consume_captured ? (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setConfirmRefundId(row.id)}
                        >
                          {t('Confirm Refunded')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
            {!snapshotsQuery.isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={20}
                  className='text-muted-foreground h-20 text-center'
                >
                  {t('No billing anomalies')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {selectedSnapshot ? (
        <Card size='sm'>
          <CardContent className='space-y-3'>
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-5'>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Request ID')}
                </div>
                <div className='font-mono text-xs break-all'>
                  {selectedSnapshot.request_id}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Upstream Request ID')}
                </div>
                <div className='font-mono text-xs break-all'>
                  {selectedSnapshot.upstream_request_id || '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Price versions')}
                </div>
                <div className='font-mono text-xs'>
                  P#{selectedSnapshot.purchase_price_version_id ?? '—'} · R#
                  {selectedSnapshot.retail_price_version_id ?? '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Resolution')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.resolution || '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Created')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.created_at
                    ? dayjs
                        .unix(selectedSnapshot.created_at)
                        .format('YYYY-MM-DD HH:mm:ss')
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Resolved at')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.resolved_at
                    ? dayjs
                        .unix(selectedSnapshot.resolved_at)
                        .format('YYYY-MM-DD HH:mm:ss')
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Resolved by')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.resolved_by
                    ? `#${selectedSnapshot.resolved_by}`
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Billing')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.billing_source === 'subscription'
                    ? `${t('Subscription')} #${selectedSnapshot.subscription_id || '—'}`
                    : t('Wallet')}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Actual pre-consumed quota')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.pre_consume_captured
                    ? (selectedSnapshot.actual_pre_consumed_quota ?? 0)
                    : t('Legacy evidence unavailable')}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Token pre-consumed quota')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.pre_consume_captured
                    ? (selectedSnapshot.token_pre_consumed_quota ?? 0)
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Supplier cost source')}
                </div>
                <div className='text-xs'>
                  {selectedSnapshot.provider_cost_mode
                    ? t(
                        providerCostModeLabel[
                          selectedSnapshot.provider_cost_mode
                        ]
                      )
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Supplier cost status')}
                </div>
                <div className='text-xs'>
                  {selectedSnapshot.provider_cost_status
                    ? t(
                        providerCostStatusLabel[
                          selectedSnapshot.provider_cost_status
                        ]
                      )
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Cost evidence')}
                </div>
                <div className='text-xs'>
                  {selectedSnapshot.provider_cost_source
                    ? t(
                        providerCostSourceLabel[
                          selectedSnapshot.provider_cost_source
                        ]
                      )
                    : '—'}
                </div>
              </div>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Cost confirmed at')}
                </div>
                <div className='font-mono text-xs'>
                  {selectedSnapshot.provider_cost_confirmed_at
                    ? dayjs
                        .unix(selectedSnapshot.provider_cost_confirmed_at)
                        .format('YYYY-MM-DD HH:mm:ss')
                    : '—'}
                </div>
              </div>
            </div>
            <div className='grid gap-3 lg:grid-cols-2'>
              {[
                {
                  label: t('Estimated usage'),
                  value: selectedSnapshot.estimated_usage,
                },
                {
                  label: t('Actual usage'),
                  value: selectedSnapshot.actual_usage,
                },
              ].map((item) => (
                <div key={item.label}>
                  <div className='text-muted-foreground mb-1 text-xs'>
                    {item.label}
                  </div>
                  <pre className='bg-muted max-h-64 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap'>
                    {formatPricingUsage(item.value)}
                  </pre>
                </div>
              ))}
            </div>
            {(selectedSnapshot.status === 'settled' ||
              selectedSnapshot.status === 'refunded') &&
            canOperate &&
            !selectedSnapshot.provider_cost_known ? (
              <div className='grid gap-2'>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Record the final USD cost from the provider bill. A full provider cost recalculates margin and cannot be changed after recording.'
                  )}
                </p>
                <form
                  className='flex flex-wrap items-end gap-2'
                  onSubmit={(event) => {
                    event.preventDefault()
                    providerCostMutation.mutate({
                      id: selectedSnapshot.id,
                      cost: providerCost,
                      scope: providerCostScope,
                    })
                  }}
                >
                  <label className='grid gap-1 text-xs'>
                    <span>{t('Provider reported cost (USD)')}</span>
                    <Input
                      type='number'
                      required
                      min='0'
                      step='0.00000001'
                      inputMode='decimal'
                      value={providerCost}
                      onChange={(event) => setProviderCost(event.target.value)}
                    />
                  </label>
                  <label className='grid gap-1 text-xs'>
                    <span>{t('Provider cost scope')}</span>
                    <NativeSelect
                      value={providerCostScope}
                      onChange={(event) =>
                        setProviderCostScope(
                          event.target.value as
                            | 'full_provider_cost'
                            | 'platform_fee_only'
                        )
                      }
                    >
                      <NativeSelectOption value='full_provider_cost'>
                        {t('Full provider cost')}
                      </NativeSelectOption>
                      <NativeSelectOption value='platform_fee_only'>
                        {t('Platform fee only')}
                      </NativeSelectOption>
                    </NativeSelect>
                  </label>
                  <Button
                    type='submit'
                    size='sm'
                    disabled={providerCostMutation.isPending}
                  >
                    {t('Record provider cost')}
                  </Button>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
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
        open={canOperate && confirmRefundId !== null}
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
