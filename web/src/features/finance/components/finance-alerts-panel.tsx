import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
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
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import { formatNumber, formatTimestampToDate } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  acknowledgeFinanceAlert,
  getFinanceAlerts,
  getFinanceAlertSummary,
  resolveFinanceAlert,
  scanFinanceAlerts,
} from '../api'
import type {
  FinanceAlert,
  FinanceAlertSeverity,
  FinanceAlertSource,
  FinanceAlertStatus,
} from '../types'

const ALERT_PAGE_SIZE = 20

type FinanceAlertsPanelProps = {
  canOperate: boolean
}

export function FinanceAlertsPanel(props: FinanceAlertsPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<FinanceAlertStatus | 'all'>('open')
  const [severity, setSeverity] = useState<FinanceAlertSeverity | 'all'>('all')
  const [source, setSource] = useState<FinanceAlertSource | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [resolveAlert, setResolveAlert] = useState<FinanceAlert | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const deferredKeyword = useDeferredValue(keyword.trim())
  const queryKeyword =
    deferredKeyword.length === 0 || deferredKeyword.length >= 2
      ? deferredKeyword
      : ''

  const summaryQuery = useQuery({
    queryKey: ['finance', 'alerts', 'summary'],
    queryFn: async () => {
      const response = await getFinanceAlertSummary()
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load finance alert summary.')
        )
      }
      return response.data
    },
    staleTime: 15_000,
  })

  const alertsQuery = useQuery({
    queryKey: [
      'finance',
      'alerts',
      status,
      severity,
      source,
      queryKeyword,
      page,
    ],
    queryFn: async () => {
      const response = await getFinanceAlerts(
        {
          status: status === 'all' ? undefined : status,
          severity: severity === 'all' ? undefined : severity,
          source: source === 'all' ? undefined : source,
          keyword: queryKeyword || undefined,
        },
        page,
        ALERT_PAGE_SIZE
      )
      if (!response.success) {
        throw new Error(response.message || t('Failed to load finance alerts.'))
      }
      return response.data
    },
    placeholderData: (previous) => previous,
  })

  const invalidateAlerts = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance', 'alerts'] })
  }

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await scanFinanceAlerts()
      if (!response.success) {
        throw new Error(response.message || t('Finance anomaly scan failed.'))
      }
      return response.data
    },
    onSuccess: async (result) => {
      toast.success(
        t('Finance anomaly scan completed: {{count}} active findings.', {
          count:
            result.negative_balance_count +
            result.stale_pending_count +
            result.incomplete_order_count +
            (result.stale_callback_count ?? 0),
        })
      )
      await invalidateAlerts()
    },
    onError: handleServerError,
  })

  const acknowledgeMutation = useMutation({
    mutationFn: async (alertID: number) => {
      const response = await acknowledgeFinanceAlert(alertID)
      if (!response.success) {
        throw new Error(response.message || t('Failed to acknowledge alert.'))
      }
      return response.data
    },
    onSuccess: async () => {
      toast.success(t('Alert acknowledged.'))
      await invalidateAlerts()
    },
    onError: handleServerError,
  })

  const resolveMutation = useMutation({
    mutationFn: async (request: { alertID: number; note: string }) => {
      const response = await resolveFinanceAlert(request.alertID, request.note)
      if (!response.success) {
        throw new Error(response.message || t('Failed to resolve alert.'))
      }
      return response.data
    },
    onSuccess: async () => {
      setResolveAlert(null)
      setResolutionNote('')
      toast.success(t('Alert resolved.'))
      await invalidateAlerts()
    },
    onError: handleServerError,
  })

  const rows = alertsQuery.data?.items ?? []
  const total = alertsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ALERT_PAGE_SIZE))

  return (
    <>
      <div className='space-y-4'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <AlertMetric
            label={t('Open alerts')}
            value={summaryQuery.data?.open_count}
            loading={summaryQuery.isLoading}
            icon={BellRing}
          />
          <AlertMetric
            label={t('Critical alerts')}
            value={summaryQuery.data?.critical_open_count}
            loading={summaryQuery.isLoading}
            icon={ShieldAlert}
          />
          <AlertMetric
            label={t('Warning alerts')}
            value={summaryQuery.data?.warning_open_count}
            loading={summaryQuery.isLoading}
            icon={CircleAlert}
          />
          <AlertMetric
            label={t('Acknowledged alerts')}
            value={summaryQuery.data?.acknowledged_count}
            loading={summaryQuery.isLoading}
            icon={Check}
          />
        </div>

        <Card>
          <CardHeader className='gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <CardTitle className='text-base'>
                {t('Financial anomaly alerts')}
              </CardTitle>
              <CardDescription>
                {t(
                  'Review negative balances, inconsistent orders, failed payment callbacks, and duplicate notifications.'
                )}
              </CardDescription>
            </div>
            {props.canOperate ? (
              <Button
                variant='outline'
                disabled={scanMutation.isPending}
                onClick={() => scanMutation.mutate()}
              >
                <RefreshCw
                  data-icon='inline-start'
                  className={
                    scanMutation.isPending ? 'animate-spin' : undefined
                  }
                  aria-hidden='true'
                />
                {t('Run anomaly scan')}
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-2 lg:grid-cols-[minmax(240px,1fr)_160px_160px_190px]'>
              <div>
                <div className='relative'>
                  <Search
                    className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2'
                    aria-hidden='true'
                  />
                  <Input
                    value={keyword}
                    className='pl-9'
                    placeholder={t('Search alerts...')}
                    aria-label={t('Search alerts...')}
                    onChange={(event) => {
                      setKeyword(event.target.value)
                      setPage(1)
                    }}
                  />
                </div>
                {deferredKeyword.length === 1 ? (
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('Enter at least 2 characters to search.')}
                  </p>
                ) : null}
              </div>
              <AlertFilterSelect
                label={t('Status')}
                value={status}
                options={[
                  ['all', t('All statuses')],
                  ['open', t('Open')],
                  ['acknowledged', t('Acknowledged')],
                  ['resolved', t('Resolved')],
                ]}
                onChange={(value) => {
                  setStatus(value as FinanceAlertStatus | 'all')
                  setPage(1)
                }}
              />
              <AlertFilterSelect
                label={t('Severity')}
                value={severity}
                options={[
                  ['all', t('All severities')],
                  ['critical', t('Critical')],
                  ['warning', t('Warning')],
                  ['info', t('Info')],
                ]}
                onChange={(value) => {
                  setSeverity(value as FinanceAlertSeverity | 'all')
                  setPage(1)
                }}
              />
              <AlertFilterSelect
                label={t('Source')}
                value={source}
                options={[
                  ['all', t('All sources')],
                  ['payment_callback', t('Payment callback')],
                  ['user_balance', t('User balance')],
                  ['recharge_order', t('Recharge order')],
                ]}
                onChange={(value) => {
                  setSource(value as FinanceAlertSource | 'all')
                  setPage(1)
                }}
              />
            </div>

            <FinanceAlertContent
              rows={rows}
              loading={alertsQuery.isLoading}
              error={
                alertsQuery.error instanceof Error
                  ? alertsQuery.error.message
                  : undefined
              }
              canOperate={props.canOperate}
              operating={
                acknowledgeMutation.isPending || resolveMutation.isPending
              }
              onAcknowledge={(alertID) => acknowledgeMutation.mutate(alertID)}
              onResolve={(alert) => {
                setResolveAlert(alert)
                setResolutionNote('')
              }}
              onRetry={() => void alertsQuery.refetch()}
            />

            <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('{{count}} alerts', { count: total })}
              </span>
              <div className='flex items-center justify-end gap-2'>
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={t('Previous page')}
                  disabled={page <= 1 || alertsQuery.isLoading}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft aria-hidden='true' />
                </Button>
                <span className='text-muted-foreground min-w-20 text-center text-sm'>
                  {page} / {totalPages}
                </span>
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={t('Next page')}
                  disabled={page >= totalPages || alertsQuery.isLoading}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight aria-hidden='true' />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={resolveAlert !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResolveAlert(null)
            setResolutionNote('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Resolve finance alert')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Record the investigation result before closing this alert. It will reopen automatically if the anomaly recurs.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-2'>
            <Label htmlFor='finance-alert-resolution'>
              {t('Resolution note')}
            </Label>
            <Textarea
              id='finance-alert-resolution'
              value={resolutionNote}
              maxLength={500}
              placeholder={t('Describe the cause and corrective action.')}
              onChange={(event) => setResolutionNote(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolveMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                resolveMutation.isPending || resolutionNote.trim() === ''
              }
              onClick={() => {
                if (resolveAlert) {
                  resolveMutation.mutate({
                    alertID: resolveAlert.id,
                    note: resolutionNote.trim(),
                  })
                }
              }}
            >
              {resolveMutation.isPending ? t('Processing...') : t('Resolve')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function AlertMetric(props: {
  label: string
  value?: number
  loading: boolean
  icon: typeof BellRing
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
      <CardContent>
        {props.loading ? (
          <Skeleton className='h-8 w-24' />
        ) : (
          <div className='font-mono text-2xl font-semibold tabular-nums'>
            {formatNumber(props.value ?? 0)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AlertFilterSelect(props: {
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <Select
      value={props.value}
      onValueChange={(value) => value !== null && props.onChange(value)}
    >
      <SelectTrigger aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {props.options.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function FinanceAlertContent(props: {
  rows: FinanceAlert[]
  loading: boolean
  error?: string
  canOperate: boolean
  operating: boolean
  onAcknowledge: (alertID: number) => void
  onResolve: (alert: FinanceAlert) => void
  onRetry: () => void
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <Skeleton className='h-72 w-full rounded-lg' />
  }
  if (props.error) {
    return (
      <ErrorState
        title={t('Failed to load finance alerts.')}
        description={props.error}
        onRetry={props.onRetry}
        className='min-h-56'
      />
    )
  }
  if (props.rows.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm'>
        {t('No finance alerts found.')}
      </div>
    )
  }
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[1080px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Severity')}</TableHead>
            <TableHead>{t('Alert')}</TableHead>
            <TableHead>{t('Source')}</TableHead>
            <TableHead>{t('Entity')}</TableHead>
            <TableHead>{t('Occurrences')}</TableHead>
            <TableHead>{t('Last observed')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead className='text-right'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell>
                <AlertSeverityBadge severity={alert.severity} />
              </TableCell>
              <TableCell className='max-w-md'>
                <div className='font-medium'>{financeAlertTitle(alert, t)}</div>
                <div className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                  {financeAlertMessage(alert, t)}
                </div>
              </TableCell>
              <TableCell>{financeAlertSource(alert.source, t)}</TableCell>
              <TableCell className='max-w-48 truncate font-mono text-xs'>
                {alert.entity_id || '—'}
              </TableCell>
              <TableCell className='font-mono tabular-nums'>
                {formatNumber(alert.occurrence_count)}
              </TableCell>
              <TableCell className='whitespace-nowrap'>
                {formatTimestampToDate(alert.last_observed_at)}
              </TableCell>
              <TableCell>
                <Badge variant='outline'>
                  {financeAlertStatus(alert.status, t)}
                </Badge>
              </TableCell>
              <TableCell className='text-right'>
                {props.canOperate && alert.status !== 'resolved' ? (
                  <div className='flex justify-end gap-1'>
                    {alert.status === 'open' ? (
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={props.operating}
                        onClick={() => props.onAcknowledge(alert.id)}
                      >
                        {t('Acknowledge')}
                      </Button>
                    ) : null}
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={props.operating}
                      onClick={() => props.onResolve(alert)}
                    >
                      {t('Resolve')}
                    </Button>
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function AlertSeverityBadge(props: { severity: FinanceAlertSeverity }) {
  const { t } = useTranslation()
  const variant = props.severity === 'critical' ? 'destructive' : 'outline'
  return (
    <Badge variant={variant}>{financeAlertSeverity(props.severity, t)}</Badge>
  )
}

type Translate = (
  key: string,
  options?: Record<string, string | number>
) => string

function financeAlertSeverity(severity: FinanceAlertSeverity, t: Translate) {
  const labels: Record<FinanceAlertSeverity, string> = {
    critical: 'Critical',
    warning: 'Warning',
    info: 'Info',
  }
  return t(labels[severity])
}

function financeAlertStatus(status: FinanceAlertStatus, t: Translate) {
  const labels: Record<FinanceAlertStatus, string> = {
    open: 'Open',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
  }
  return t(labels[status])
}

function financeAlertSource(source: FinanceAlertSource, t: Translate) {
  const labels: Record<FinanceAlertSource, string> = {
    payment_callback: 'Payment callback',
    user_balance: 'User balance',
    recharge_order: 'Recharge order',
  }
  return t(labels[source])
}

function financeAlertTitle(alert: FinanceAlert, t: Translate) {
  const titles: Record<string, string> = {
    payment_callback_rejected: 'Payment callback requires review',
    payment_callback_failed: 'Payment callback processing failed',
    payment_callback_duplicate: 'Duplicate payment callback received',
    negative_wallet_balance: 'Negative user wallet balance',
    stale_pending_order: 'Recharge order remained pending for over 24 hours',
    missing_completion_time:
      'Completed recharge order is missing completion time',
  }
  return t(titles[alert.code] ?? alert.title)
}

function financeAlertMessage(alert: FinanceAlert, t: Translate) {
  let details: Record<string, unknown> = {}
  try {
    details = JSON.parse(alert.details) as Record<string, unknown>
  } catch {
    return alert.message
  }
  switch (alert.code) {
    case 'payment_callback_rejected':
    case 'payment_callback_failed':
    case 'payment_callback_duplicate':
      return t(
        'Provider {{provider}} callback for order {{tradeNo}} requires review (HTTP {{status}}).',
        {
          provider: String(details.provider || '—'),
          tradeNo: String(details.trade_no || '—'),
          status: Number(details.http_status || 0),
        }
      )
    case 'negative_wallet_balance':
      return t(
        'User {{username}} (#{{userId}}) has a negative wallet balance.',
        {
          username: String(details.username || '—'),
          userId: Number(details.user_id || 0),
        }
      )
    case 'stale_pending_order':
      return t(
        'Recharge order {{tradeNo}} is still pending after its expected expiry window.',
        { tradeNo: String(details.trade_no || alert.entity_id) }
      )
    case 'missing_completion_time':
      return t(
        'Recharge order {{tradeNo}} is successful but has no completion timestamp.',
        { tradeNo: String(details.trade_no || alert.entity_id) }
      )
    default:
      return alert.message
  }
}
