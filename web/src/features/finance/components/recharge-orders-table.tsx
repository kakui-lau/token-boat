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
import { ChevronLeft, ChevronRight, Search, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  TopupOrderType,
  TopupRecord,
  TopupStatus,
} from '@/features/wallet/types'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatQuota, formatTimestampToDate } from '@/lib/format'

import { getPaymentMethodName, getStatusConfig } from '../../wallet/lib/billing'

type RechargeOrdersTableProps = {
  rows: TopupRecord[]
  total: number
  page: number
  pageSize: number
  keyword: string
  status: TopupStatus | 'all'
  provider: string
  orderType: TopupOrderType | 'all'
  providers: string[]
  loading: boolean
  error?: string
  completing: boolean
  canComplete: boolean
  onKeywordChange: (value: string) => void
  onStatusChange: (value: TopupStatus | 'all') => void
  onProviderChange: (value: string) => void
  onOrderTypeChange: (value: TopupOrderType | 'all') => void
  onPageChange: (value: number) => void
  onComplete: (tradeNo: string) => void
  onRetry: () => void
}

const ORDER_SKELETON_KEYS = [
  'finance-order-1',
  'finance-order-2',
  'finance-order-3',
  'finance-order-4',
] as const

export function RechargeOrdersTable(props: RechargeOrdersTableProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
  let orderContent = (
    <RechargeOrderRows
      rows={props.rows}
      completing={props.completing}
      canComplete={props.canComplete}
      onComplete={props.onComplete}
    />
  )
  if (props.loading) {
    orderContent = (
      <div className='space-y-2'>
        {ORDER_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className='h-12 w-full rounded-lg' />
        ))}
      </div>
    )
  } else if (props.error) {
    orderContent = (
      <ErrorState
        title={t('Failed to load recharge orders.')}
        description={props.error}
        onRetry={props.onRetry}
        className='min-h-48'
      />
    )
  } else if (props.rows.length === 0) {
    orderContent = (
      <div className='text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm'>
        {t('No recharge orders found.')}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{t('Recharge orders')}</CardTitle>
        <CardDescription>
          {t('Search, filter, export, and reconcile recharge order history.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_160px_180px]'>
          <div className='relative'>
            <Search
              className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2'
              aria-hidden='true'
            />
            <Input
              value={props.keyword}
              onChange={(event) => props.onKeywordChange(event.target.value)}
              placeholder={t('Search by order number...')}
              className='pl-9'
              aria-label={t('Search by order number...')}
            />
          </div>
          <Select
            value={props.status}
            onValueChange={(value) =>
              value !== null &&
              props.onStatusChange(value as TopupStatus | 'all')
            }
          >
            <SelectTrigger aria-label={t('Status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='all'>{t('All statuses')}</SelectItem>
                <SelectItem value='success'>{t('Success')}</SelectItem>
                <SelectItem value='pending'>{t('Pending')}</SelectItem>
                <SelectItem value='failed'>{t('Failed')}</SelectItem>
                <SelectItem value='expired'>{t('Expired')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={props.orderType}
            onValueChange={(value) =>
              value !== null &&
              props.onOrderTypeChange(value as TopupOrderType | 'all')
            }
          >
            <SelectTrigger aria-label={t('Order type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='all'>{t('All order types')}</SelectItem>
                <SelectItem value='wallet'>{t('Wallet recharge')}</SelectItem>
                <SelectItem value='subscription'>
                  {t('Subscription purchase')}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={props.provider}
            onValueChange={(value) =>
              value !== null && props.onProviderChange(value)
            }
          >
            <SelectTrigger aria-label={t('Payment Provider')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='all'>{t('All providers')}</SelectItem>
                {props.providers.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {getPaymentMethodName(provider, t)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {orderContent}

        <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
          <span className='text-muted-foreground text-sm'>
            {t('{{count}} orders', { count: props.total })}
          </span>
          <div className='flex items-center justify-end gap-2'>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('Previous page')}
              disabled={props.page <= 1 || props.loading}
              onClick={() => props.onPageChange(props.page - 1)}
            >
              <ChevronLeft aria-hidden='true' />
            </Button>
            <span className='text-muted-foreground min-w-20 text-center text-sm'>
              {props.page} / {totalPages}
            </span>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('Next page')}
              disabled={props.page >= totalPages || props.loading}
              onClick={() => props.onPageChange(props.page + 1)}
            >
              <ChevronRight aria-hidden='true' />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RechargeOrderRows(
  props: Pick<
    RechargeOrdersTableProps,
    'rows' | 'completing' | 'canComplete' | 'onComplete'
  >
) {
  const { t } = useTranslation()

  return (
    <>
      <div className='hidden overflow-x-auto rounded-lg border md:block'>
        <Table className='min-w-[1040px]'>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Order')}</TableHead>
              <TableHead>{t('User ID')}</TableHead>
              <TableHead>{t('Payment Provider')}</TableHead>
              <TableHead>{t('Order type')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead className='text-right'>{t('Credit amount')}</TableHead>
              <TableHead className='text-right'>{t('Payment')}</TableHead>
              <TableHead>{t('Created')}</TableHead>
              <TableHead className='text-right'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.rows.map((row) => {
              const statusConfig = getStatusConfig(row.status)
              const provider =
                row.payment_provider || row.payment_method || 'legacy'
              return (
                <TableRow key={row.id}>
                  <TableCell className='max-w-56 truncate font-mono text-xs'>
                    {row.trade_no}
                  </TableCell>
                  <TableCell className='font-mono'>{row.user_id}</TableCell>
                  <TableCell>{getPaymentMethodName(provider, t)}</TableCell>
                  <TableCell>
                    {row.order_type === 'subscription'
                      ? t('Subscription purchase')
                      : t('Wallet recharge')}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={t(statusConfig.label)}
                      variant={statusConfig.variant}
                      showDot
                      copyable={false}
                    />
                  </TableCell>
                  <TableCell className='text-right font-mono tabular-nums'>
                    {row.order_type === 'subscription'
                      ? '—'
                      : formatQuota(row.credited_quota ?? 0)}
                  </TableCell>
                  <TableCell className='text-right font-mono tabular-nums'>
                    {formatCurrencyFromUSD(row.money, {
                      digitsLarge: 2,
                      digitsSmall: 2,
                      abbreviate: false,
                    })}
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {formatTimestampToDate(row.create_time)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {props.canComplete &&
                      row.status === 'pending' &&
                      row.order_type !== 'subscription' && (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={props.completing}
                          onClick={() => props.onComplete(row.trade_no)}
                        >
                          <Wrench data-icon='inline-start' />
                          {t('Complete Order')}
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className='space-y-2 md:hidden'>
        {props.rows.map((row) => {
          const statusConfig = getStatusConfig(row.status)
          const provider =
            row.payment_provider || row.payment_method || 'legacy'
          return (
            <article key={row.id} className='space-y-3 rounded-lg border p-3'>
              <div className='flex items-start justify-between gap-2'>
                <code className='min-w-0 text-xs break-all'>
                  {row.trade_no}
                </code>
                <StatusBadge
                  label={t(statusConfig.label)}
                  variant={statusConfig.variant}
                  showDot
                  copyable={false}
                />
              </div>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <OrderMetric
                  label={t('Payment Provider')}
                  value={getPaymentMethodName(provider, t)}
                />
                <OrderMetric
                  label={t('Order type')}
                  value={
                    row.order_type === 'subscription'
                      ? t('Subscription purchase')
                      : t('Wallet recharge')
                  }
                />
                <OrderMetric label={t('User ID')} value={String(row.user_id)} />
                <OrderMetric
                  label={t('Credit amount')}
                  value={
                    row.order_type === 'subscription'
                      ? '—'
                      : formatQuota(row.credited_quota ?? 0)
                  }
                />
                <OrderMetric
                  label={t('Payment')}
                  value={formatCurrencyFromUSD(row.money)}
                />
              </div>
              <div className='text-muted-foreground text-xs'>
                {formatTimestampToDate(row.create_time)}
              </div>
              {props.canComplete &&
                row.status === 'pending' &&
                row.order_type !== 'subscription' && (
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    disabled={props.completing}
                    onClick={() => props.onComplete(row.trade_no)}
                  >
                    <Wrench data-icon='inline-start' />
                    {t('Complete Order')}
                  </Button>
                )}
            </article>
          )
        })}
      </div>
    </>
  )
}

function OrderMetric(props: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 font-medium'>{props.value}</div>
    </div>
  )
}
