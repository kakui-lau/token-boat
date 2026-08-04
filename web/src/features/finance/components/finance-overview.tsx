import {
  BadgeDollarSign,
  CreditCard,
  HandCoins,
  TicketCheck,
  Users,
  WalletCards,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber, formatQuota } from '@/lib/format'

import type { FinanceOverview } from '../types'

type FinanceOverviewProps = {
  data?: FinanceOverview
  loading: boolean
}

const SUMMARY_SKELETON_KEYS = [
  'finance-summary-1',
  'finance-summary-2',
  'finance-summary-3',
  'finance-summary-4',
] as const

export function FinanceOverviewPanel(props: FinanceOverviewProps) {
  const { t } = useTranslation()

  if (props.loading || !props.data) {
    return (
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {SUMMARY_SKELETON_KEYS.map((key) => (
          <Card key={key}>
            <CardHeader className='pb-2'>
              <Skeleton className='h-4 w-32' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-8 w-36' />
              <Skeleton className='mt-3 h-3 w-48' />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: t('Total unconsumed balance'),
      value: formatQuota(props.data.balance.total_available_quota),
      description: t(
        'Includes wallet, affiliate, and finite active subscription balances.'
      ),
      icon: HandCoins,
    },
    {
      title: t('Wallet balances'),
      value: formatQuota(props.data.balance.wallet_quota),
      description: t('{{count}} users currently hold a balance', {
        count: props.data.balance.users_with_balance,
      }),
      icon: WalletCards,
    },
    {
      title: t('Subscription quota remaining'),
      value: formatQuota(props.data.balance.subscription_quota),
      description: t('{{count}} unlimited active subscriptions', {
        count: props.data.balance.unlimited_subscription_count,
      }),
      icon: CreditCard,
    },
    {
      title: t('Successful payments'),
      value: formatCurrencyFromUSD(props.data.orders.success_amount, {
        digitsLarge: 2,
        digitsSmall: 2,
        abbreviate: false,
      }),
      description: t('{{count}} completed orders in the selected period', {
        count: props.data.orders.external_success_count,
      }),
      icon: BadgeDollarSign,
    },
  ]

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {cards.map((card) => (
          <Card key={card.title} className='overflow-hidden'>
            <CardHeader className='flex-row items-start justify-between gap-3 pb-2'>
              <div className='space-y-1'>
                <CardTitle className='text-sm font-medium'>
                  {card.title}
                </CardTitle>
                <CardDescription className='text-xs'>
                  {card.description}
                </CardDescription>
              </div>
              <span className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                <card.icon className='size-4' aria-hidden='true' />
              </span>
            </CardHeader>
            <CardContent>
              <div className='font-mono text-2xl font-semibold tabular-nums'>
                {card.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-3 lg:grid-cols-3'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <Users className='size-4' aria-hidden='true' />
              {t('Balance composition')}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <MetricRow
              label={t('Affiliate rewards pending')}
              value={formatQuota(props.data.balance.affiliate_quota)}
            />
            <MetricRow
              label={t('Negative wallet balance')}
              value={formatQuota(props.data.balance.negative_wallet_quota)}
              warning={props.data.balance.negative_wallet_quota > 0}
            />
            <MetricRow
              label={t('Total users')}
              value={formatNumber(props.data.balance.user_count)}
            />
          </CardContent>
        </Card>

        <Card data-testid='redemption-summary'>
          <CardHeader className='gap-1'>
            <CardTitle className='flex items-center gap-2 text-sm'>
              <TicketCheck className='size-4' aria-hidden='true' />
              {t('Redemption code summary')}
            </CardTitle>
            <CardDescription className='text-xs'>
              {t('Code counts and total USD values are shown separately.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 text-sm'>
            <div className='text-muted-foreground grid grid-cols-[minmax(0,1fr)_4.5rem_7rem] items-center gap-3 px-2 text-xs'>
              <span aria-hidden='true' />
              <span className='text-right'>{t('Code count')}</span>
              <span className='text-right'>{t('Total value')}</span>
            </div>
            <RedemptionMetricRow
              testId='redemption-summary-available'
              label={t('Available unredeemed codes')}
              count={props.data.redemptions.available_count}
              value={formatQuota(props.data.redemptions.available_quota)}
            />
            <RedemptionMetricRow
              testId='redemption-summary-redeemed'
              label={t('Redeemed in selected period')}
              count={props.data.redemptions.redeemed_count}
              value={formatQuota(props.data.redemptions.redeemed_quota)}
            />
            <RedemptionMetricRow
              testId='redemption-summary-expired'
              label={t('Expired unused codes')}
              count={props.data.redemptions.expired_count}
              value={formatQuota(props.data.redemptions.expired_quota)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('Order overview')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <StatusMetric
                label={t('Completed')}
                count={props.data.orders.success_count}
                tone='success'
              />
              <StatusMetric
                label={t('Pending')}
                count={props.data.orders.pending_count}
                tone='pending'
              />
              <StatusMetric
                label={t('Expired')}
                count={props.data.orders.expired_count}
                tone='neutral'
              />
              <StatusMetric
                label={t('Failed')}
                count={props.data.orders.failed_count}
                tone='failed'
              />
            </div>
            <div className='space-y-3 border-t pt-3 text-sm'>
              <MetricRow
                label={t('Wallet recharge revenue')}
                value={`${formatNumber(props.data.orders.wallet_success_count)} · ${formatCurrencyFromUSD(props.data.orders.wallet_success_amount)}`}
              />
              <MetricRow
                label={t('Subscription revenue')}
                value={`${formatNumber(props.data.orders.subscription_success_count)} · ${formatCurrencyFromUSD(props.data.orders.subscription_success_amount)}`}
              />
              <MetricRow
                label={t('Internal balance settlement')}
                value={`${formatNumber(props.data.orders.internal_subscription_count)} · ${formatCurrencyFromUSD(props.data.orders.internal_subscription_amount)}`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricRow(props: { label: string; value: string; warning?: boolean }) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className='text-muted-foreground'>{props.label}</span>
      <span
        className={
          props.warning
            ? 'text-destructive font-mono font-medium tabular-nums'
            : 'font-mono font-medium tabular-nums'
        }
      >
        {props.value}
      </span>
    </div>
  )
}

function RedemptionMetricRow(props: {
  testId: string
  label: string
  count: number
  value: string
}) {
  return (
    <div
      className='bg-muted/40 grid grid-cols-[minmax(0,1fr)_4.5rem_7rem] items-center gap-3 rounded-lg px-2 py-2.5'
      data-testid={props.testId}
    >
      <span className='min-w-0 font-medium'>{props.label}</span>
      <span className='text-right font-mono font-semibold tabular-nums'>
        {formatNumber(props.count)}
      </span>
      <span className='text-right font-mono font-semibold tabular-nums'>
        {props.value}
      </span>
    </div>
  )
}

function StatusMetric(props: {
  label: string
  count: number
  tone: 'success' | 'pending' | 'neutral' | 'failed'
}) {
  const dotClassName = {
    success: 'bg-emerald-500',
    pending: 'bg-amber-500',
    neutral: 'bg-slate-400',
    failed: 'bg-destructive',
  }[props.tone]
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-2 flex items-center justify-between gap-2'>
        <span className='font-mono text-xl font-semibold tabular-nums'>
          {formatNumber(props.count)}
        </span>
        <span
          className={`size-2 rounded-full ${dotClassName}`}
          aria-hidden='true'
        />
      </div>
    </div>
  )
}
