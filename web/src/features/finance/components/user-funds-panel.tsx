import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Search,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getStatusConfig } from '@/features/wallet/lib/billing'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber, formatQuota, formatTimestampToDate } from '@/lib/format'

import { getFinanceUserDetail, getFinanceUsers } from '../api'
import type { FinanceUserDetail, FinanceUserListItem } from '../types'

const USER_PAGE_SIZE = 20

export function UserFundsPanel() {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUserID, setSelectedUserID] = useState<number | null>(null)
  const deferredKeyword = useDeferredValue(keyword.trim())
  const keywordIsUsable =
    deferredKeyword.length === 0 ||
    deferredKeyword.length >= 2 ||
    /^\d+$/.test(deferredKeyword)
  const queryKeyword = keywordIsUsable ? deferredKeyword : ''

  const usersQuery = useQuery({
    queryKey: ['finance', 'users', queryKeyword, page],
    queryFn: async () => {
      const response = await getFinanceUsers(queryKeyword, page, USER_PAGE_SIZE)
      if (!response.success) {
        throw new Error(response.message || t('Failed to load finance users.'))
      }
      return response.data
    },
    placeholderData: (previous) => previous,
  })

  useEffect(() => {
    const rows = usersQuery.data?.items ?? []
    if (rows.length === 0) {
      setSelectedUserID(null)
      return
    }
    if (!rows.some((user) => user.id === selectedUserID)) {
      setSelectedUserID(rows[0].id)
    }
  }, [selectedUserID, usersQuery.data?.items])

  const detailQuery = useQuery({
    queryKey: ['finance', 'user-detail', selectedUserID],
    queryFn: async () => {
      const response = await getFinanceUserDetail(selectedUserID ?? 0)
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load user fund details.')
        )
      }
      return response.data
    },
    enabled: selectedUserID !== null,
    staleTime: 15_000,
  })

  const total = usersQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE))

  return (
    <div className='grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]'>
      <Card className='h-fit'>
        <CardHeader>
          <CardTitle className='text-base'>{t('User funds')}</CardTitle>
          <CardDescription>
            {t('Search users by ID, username, display name, or email.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <div className='relative'>
              <Search
                className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2'
                aria-hidden='true'
              />
              <Input
                value={keyword}
                className='pl-9'
                placeholder={t('Search users...')}
                aria-label={t('Search users...')}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setPage(1)
                }}
              />
            </div>
            {!keywordIsUsable ? (
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Enter at least 2 characters to search.')}
              </p>
            ) : null}
          </div>

          <UserList
            rows={usersQuery.data?.items ?? []}
            selectedUserID={selectedUserID}
            loading={usersQuery.isLoading}
            error={
              usersQuery.error instanceof Error
                ? usersQuery.error.message
                : undefined
            }
            onSelect={setSelectedUserID}
            onRetry={() => void usersQuery.refetch()}
          />

          <div className='flex items-center justify-between border-t pt-3'>
            <span className='text-muted-foreground text-xs'>
              {t('{{count}} users', { count: total })}
            </span>
            <div className='flex items-center gap-1'>
              <Button
                variant='ghost'
                size='icon'
                aria-label={t('Previous page')}
                disabled={page <= 1 || usersQuery.isLoading}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden='true' />
              </Button>
              <span className='text-muted-foreground min-w-14 text-center text-xs'>
                {page} / {totalPages}
              </span>
              <Button
                variant='ghost'
                size='icon'
                aria-label={t('Next page')}
                disabled={page >= totalPages || usersQuery.isLoading}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden='true' />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <UserFundDetail
        data={detailQuery.data}
        loading={detailQuery.isLoading}
        error={
          detailQuery.error instanceof Error
            ? detailQuery.error.message
            : undefined
        }
        onRetry={() => void detailQuery.refetch()}
      />
    </div>
  )
}

function UserList(props: {
  rows: FinanceUserListItem[]
  selectedUserID: number | null
  loading: boolean
  error?: string
  onSelect: (userID: number) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <Skeleton className='h-96 w-full rounded-lg' />
  }
  if (props.error) {
    return (
      <ErrorState
        title={t('Failed to load finance users.')}
        description={props.error}
        onRetry={props.onRetry}
        className='min-h-64'
      />
    )
  }
  if (props.rows.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm'>
        {t('No users found.')}
      </div>
    )
  }
  return (
    <div className='max-h-[560px] space-y-2 overflow-y-auto pr-1'>
      {props.rows.map((user) => (
        <button
          key={user.id}
          type='button'
          className={
            user.id === props.selectedUserID
              ? 'border-primary bg-primary/5 w-full rounded-lg border p-3 text-left'
              : 'hover:bg-muted/60 w-full rounded-lg border p-3 text-left transition-colors'
          }
          onClick={() => props.onSelect(user.id)}
        >
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='truncate font-medium'>{user.username}</div>
              <div className='text-muted-foreground truncate text-xs'>
                {user.display_name || user.email || `#${user.id}`}
              </div>
            </div>
            <Badge variant='outline'>#{user.id}</Badge>
          </div>
          <div className='mt-3 flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>{t('Wallet balance')}</span>
            <span className='font-mono tabular-nums'>
              {formatQuota(user.wallet_quota)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

function UserFundDetail(props: {
  data?: FinanceUserDetail
  loading: boolean
  error?: string
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <Skeleton className='h-[720px] w-full rounded-xl' />
  }
  if (props.error) {
    return (
      <ErrorState
        title={t('Failed to load user fund details.')}
        description={props.error}
        onRetry={props.onRetry}
        className='min-h-96'
      />
    )
  }
  if (!props.data) {
    return (
      <div className='text-muted-foreground flex min-h-96 items-center justify-center rounded-xl border border-dashed text-sm'>
        {t('Select a user to view fund details.')}
      </div>
    )
  }

  const data = props.data
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader className='flex-row items-start justify-between gap-4'>
          <div>
            <CardTitle className='flex items-center gap-2 text-base'>
              <UserRound className='size-4' aria-hidden='true' />
              {data.user.display_name || data.user.username}
            </CardTitle>
            <CardDescription>
              @{data.user.username} · #{data.user.id} · {data.user.group}
            </CardDescription>
          </div>
          <Badge variant='outline'>{data.user.email || t('No email')}</Badge>
        </CardHeader>
      </Card>

      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <FundMetric
          label={t('Total available balance')}
          value={formatQuota(data.total_available_quota)}
          icon={WalletCards}
        />
        <FundMetric
          label={t('Wallet balance')}
          value={formatQuota(data.user.wallet_quota)}
          icon={CircleDollarSign}
        />
        <FundMetric
          label={t('Active subscription balance')}
          value={formatQuota(data.active_subscription_quota)}
          icon={CreditCard}
        />
        <FundMetric
          label={t('Lifetime usage')}
          value={formatQuota(data.user.used_quota)}
          icon={WalletCards}
        />
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>{t('Funding summary')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <FundRow
              label={t('Successful external payments')}
              value={`${formatNumber(data.funding.successful_order_count)} · ${formatCurrencyFromUSD(data.funding.successful_amount, { abbreviate: false })}`}
            />
            <FundRow
              label={t('Quota credited from payments')}
              value={formatQuota(data.funding.credited_quota)}
            />
            <FundRow
              label={t('Redemption code credits')}
              value={`${formatNumber(data.funding.redemption_count)} · ${formatQuota(data.funding.redemption_quota)}`}
            />
            <FundRow
              label={t('Affiliate balance')}
              value={formatQuota(data.user.affiliate_quota)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('Active subscriptions')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {data.subscriptions.length === 0 ? (
              <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
                {t('No active subscriptions.')}
              </div>
            ) : (
              data.subscriptions.map((subscription) => (
                <div key={subscription.id} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <div className='font-medium'>
                        {subscription.plan_title || `#${subscription.plan_id}`}
                      </div>
                      <div className='text-muted-foreground mt-1 text-xs'>
                        {formatTimestampToDate(subscription.start_time)} →{' '}
                        {formatTimestampToDate(subscription.end_time)}
                      </div>
                    </div>
                    <Badge variant='outline'>
                      {subscription.unlimited
                        ? t('Unlimited')
                        : formatQuota(subscription.remaining_quota)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('Recent funding orders')}
          </CardTitle>
          <CardDescription>
            {t('The latest 20 recharge and subscription payment records.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recent_orders.length === 0 ? (
            <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
              {t('No funding orders found.')}
            </div>
          ) : (
            <div className='overflow-x-auto rounded-lg border'>
              <Table className='min-w-[760px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Order')}</TableHead>
                    <TableHead>{t('Payment Provider')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead className='text-right'>{t('Payment')}</TableHead>
                    <TableHead>{t('Created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_orders.map((order) => {
                    const statusConfig = getStatusConfig(order.status)
                    return (
                      <TableRow key={order.id}>
                        <TableCell className='max-w-64 truncate font-mono text-xs'>
                          {order.trade_no}
                        </TableCell>
                        <TableCell>
                          {order.payment_provider ||
                            order.payment_method ||
                            'legacy'}
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
                          {formatCurrencyFromUSD(order.money, {
                            abbreviate: false,
                          })}
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          {formatTimestampToDate(order.create_time)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FundMetric(props: {
  label: string
  value: string
  icon: typeof WalletCards
}) {
  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between gap-3 pb-2'>
        <CardDescription>{props.label}</CardDescription>
        <props.icon
          className='text-muted-foreground size-4'
          aria-hidden='true'
        />
      </CardHeader>
      <CardContent className='font-mono text-xl font-semibold tabular-nums'>
        {props.value}
      </CardContent>
    </Card>
  )
}

function FundRow(props: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0'>
      <span className='text-muted-foreground'>{props.label}</span>
      <span className='text-right font-mono font-medium tabular-nums'>
        {props.value}
      </span>
    </div>
  )
}
