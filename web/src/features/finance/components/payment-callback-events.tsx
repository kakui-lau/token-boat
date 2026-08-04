import { useQuery } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  Search,
  Webhook,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatTimestampToDate } from '@/lib/format'

import { getPaymentCallbackEvents, getPaymentCallbackSummary } from '../api'
import type {
  FinancePeriod,
  PaymentCallbackEvent,
  PaymentCallbackStatus,
} from '../types'

const CALLBACK_PAGE_SIZE = 20
const PAYMENT_PROVIDERS = [
  'stripe',
  'creem',
  'epay',
  'waffo',
  'waffo_pancake',
] as const

type PaymentCallbackEventsProps = {
  period: FinancePeriod
}

export function PaymentCallbackEvents(props: PaymentCallbackEventsProps) {
  const { t } = useTranslation()
  const [provider, setProvider] = useState('all')
  const [status, setStatus] = useState<PaymentCallbackStatus | 'all'>('all')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [selectedEvent, setSelectedEvent] =
    useState<PaymentCallbackEvent | null>(null)
  const deferredKeyword = useDeferredValue(keyword.trim())
  const queryKeyword =
    deferredKeyword.length === 0 || deferredKeyword.length >= 2
      ? deferredKeyword
      : ''

  const summaryQuery = useQuery({
    queryKey: ['finance', 'callbacks', 'summary', props.period],
    queryFn: async () => {
      const response = await getPaymentCallbackSummary(props.period)
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load payment callback summary.')
        )
      }
      return response.data
    },
    staleTime: 15_000,
  })

  const eventsQuery = useQuery({
    queryKey: [
      'finance',
      'callbacks',
      props.period,
      provider,
      status,
      queryKeyword,
      page,
    ],
    queryFn: async () => {
      const response = await getPaymentCallbackEvents(
        {
          period: props.period,
          provider: provider === 'all' ? undefined : provider,
          status: status === 'all' ? undefined : status,
          keyword: queryKeyword || undefined,
        },
        page,
        CALLBACK_PAGE_SIZE
      )
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load payment callback events.')
        )
      }
      return response.data
    },
    placeholderData: (previous) => previous,
  })

  const rows = eventsQuery.data?.items ?? []
  const total = eventsQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / CALLBACK_PAGE_SIZE))

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <CallbackMetric
          label={t('Callback events')}
          value={summaryQuery.data?.total_count}
          loading={summaryQuery.isLoading}
          icon={Webhook}
        />
        <CallbackMetric
          label={t('Processed callbacks')}
          value={summaryQuery.data?.processed_count}
          loading={summaryQuery.isLoading}
          icon={CheckCircle2}
        />
        <CallbackMetric
          label={t('Rejected or failed')}
          value={
            (summaryQuery.data?.rejected_count ?? 0) +
            (summaryQuery.data?.failed_count ?? 0)
          }
          loading={summaryQuery.isLoading}
          icon={CircleAlert}
        />
        <CallbackMetric
          label={t('Duplicate callbacks')}
          value={summaryQuery.data?.duplicate_count}
          loading={summaryQuery.isLoading}
          icon={Copy}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('Payment callback events')}
          </CardTitle>
          <CardDescription>
            {t(
              'Audit inbound payment notifications, verification outcomes, duplicates, and processing failures.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_180px]'>
            <div>
              <div className='relative'>
                <Search
                  className='text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2'
                  aria-hidden='true'
                />
                <Input
                  value={keyword}
                  className='pl-9'
                  placeholder={t('Search event or order number...')}
                  aria-label={t('Search event or order number...')}
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
            <Select
              value={provider}
              onValueChange={(value) => {
                if (value !== null) {
                  setProvider(value)
                  setPage(1)
                }
              }}
            >
              <SelectTrigger aria-label={t('Payment Provider')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='all'>{t('All providers')}</SelectItem>
                  {PAYMENT_PROVIDERS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => {
                if (value !== null) {
                  setStatus(value as PaymentCallbackStatus | 'all')
                  setPage(1)
                }
              }}
            >
              <SelectTrigger aria-label={t('Status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='all'>{t('All statuses')}</SelectItem>
                  <SelectItem value='processed'>{t('Processed')}</SelectItem>
                  <SelectItem value='rejected'>{t('Rejected')}</SelectItem>
                  <SelectItem value='failed'>{t('Failed')}</SelectItem>
                  <SelectItem value='received'>{t('Received')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <CallbackEventContent
            rows={rows}
            loading={eventsQuery.isLoading}
            error={
              eventsQuery.error instanceof Error
                ? eventsQuery.error.message
                : undefined
            }
            onRetry={() => void eventsQuery.refetch()}
            onView={setSelectedEvent}
          />

          <div className='flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('{{count}} callback events', { count: total })}
            </span>
            <div className='flex items-center justify-end gap-2'>
              <Button
                variant='outline'
                size='icon'
                aria-label={t('Previous page')}
                disabled={page <= 1 || eventsQuery.isLoading}
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
                disabled={page >= totalPages || eventsQuery.isLoading}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight aria-hidden='true' />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <CallbackEventSheet
        event={selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
      />
    </div>
  )
}

function CallbackMetric(props: {
  label: string
  value?: number
  loading: boolean
  icon: typeof Webhook
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

function CallbackEventContent(props: {
  rows: PaymentCallbackEvent[]
  loading: boolean
  error?: string
  onRetry: () => void
  onView: (event: PaymentCallbackEvent) => void
}) {
  const { t } = useTranslation()
  if (props.loading) {
    return <Skeleton className='h-64 w-full rounded-lg' />
  }
  if (props.error) {
    return (
      <ErrorState
        title={t('Failed to load payment callback events.')}
        description={props.error}
        onRetry={props.onRetry}
        className='min-h-56'
      />
    )
  }
  if (props.rows.length === 0) {
    return (
      <div className='text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm'>
        {t('No payment callback events found.')}
      </div>
    )
  }
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[1040px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Provider')}</TableHead>
            <TableHead>{t('Event type')}</TableHead>
            <TableHead>{t('Order')}</TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('HTTP status')}</TableHead>
            <TableHead>{t('Duration')}</TableHead>
            <TableHead>{t('Received')}</TableHead>
            <TableHead className='text-right'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.rows.map((event) => (
            <TableRow key={event.id}>
              <TableCell className='font-medium'>{event.provider}</TableCell>
              <TableCell>{event.event_type || '—'}</TableCell>
              <TableCell className='max-w-48 truncate font-mono text-xs'>
                {event.trade_no || '—'}
              </TableCell>
              <TableCell>
                <CallbackStatusBadge event={event} />
              </TableCell>
              <TableCell className='font-mono'>{event.http_status}</TableCell>
              <TableCell className='font-mono'>
                {event.duration_ms} ms
              </TableCell>
              <TableCell className='whitespace-nowrap'>
                {formatTimestampToDate(event.received_at)}
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => props.onView(event)}
                >
                  <Eye data-icon='inline-start' aria-hidden='true' />
                  {t('View')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CallbackStatusBadge(props: { event: PaymentCallbackEvent }) {
  const { t } = useTranslation()
  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary'
  if (props.event.processing_status === 'processed') {
    variant = 'default'
  } else if (
    props.event.processing_status === 'rejected' ||
    props.event.processing_status === 'failed'
  ) {
    variant = 'destructive'
  }
  return (
    <div className='flex flex-wrap gap-1'>
      <Badge variant={variant}>
        {t(callbackStatusKey(props.event.processing_status))}
      </Badge>
      {props.event.duplicate ? (
        <Badge variant='outline'>{t('Duplicate')}</Badge>
      ) : null}
    </div>
  )
}

function callbackStatusKey(status: PaymentCallbackStatus) {
  const keys: Record<PaymentCallbackStatus, string> = {
    received: 'Received',
    processed: 'Processed',
    rejected: 'Rejected',
    failed: 'Failed',
  }
  return keys[status]
}

function CallbackEventSheet(props: {
  event: PaymentCallbackEvent | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const event = props.event
  return (
    <Sheet open={event !== null} onOpenChange={props.onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>{t('Callback event details')}</SheetTitle>
          <SheetDescription>
            {t('Sensitive payment fields are redacted before storage.')}
          </SheetDescription>
        </SheetHeader>
        {event ? (
          <div className='space-y-4 p-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <CallbackDetail
                label={t('Event ID')}
                value={event.event_id || '—'}
              />
              <CallbackDetail label={t('Provider')} value={event.provider} />
              <CallbackDetail
                label={t('Event type')}
                value={event.event_type || '—'}
              />
              <CallbackDetail
                label={t('Order')}
                value={event.trade_no || '—'}
              />
              <CallbackDetail
                label={t('Request path')}
                value={event.request_path}
              />
              <CallbackDetail
                label={t('Client IP')}
                value={event.client_ip || '—'}
              />
              <CallbackDetail
                label={t('Verification')}
                value={t(callbackVerificationKey(event.verification_status))}
              />
              <CallbackDetail
                label={t('Processing outcome')}
                value={t(callbackStatusKey(event.processing_status))}
              />
              <CallbackDetail
                label={t('HTTP status')}
                value={String(event.http_status)}
              />
              <CallbackDetail
                label={t('Duration')}
                value={`${event.duration_ms} ms`}
              />
              <CallbackDetail
                label={t('Payload digest')}
                value={event.payload_digest}
              />
              <CallbackDetail
                label={t('Received')}
                value={formatTimestampToDate(event.received_at)}
              />
            </div>
            {event.error_message ? (
              <div className='border-destructive/30 bg-destructive/5 rounded-lg border p-3'>
                <div className='text-destructive text-xs font-medium'>
                  {t('Error message')}
                </div>
                <div className='mt-1 text-sm break-words'>
                  {event.error_message}
                </div>
              </div>
            ) : null}
            <div>
              <div className='mb-2 text-sm font-medium'>
                {t('Sanitized payload')}
              </div>
              <pre className='bg-muted max-h-[420px] overflow-auto rounded-lg border p-3 text-xs break-all whitespace-pre-wrap'>
                {event.payload_preview || '{}'}
              </pre>
              <Button
                variant='outline'
                size='sm'
                className='mt-2'
                onClick={() => {
                  navigator.clipboard
                    .writeText(event.payload_preview || '{}')
                    .then(() => toast.success(t('Copied')))
                    .catch(() => toast.error(t('Copy failed')))
                }}
              >
                <Copy data-icon='inline-start' aria-hidden='true' />
                {t('Copy payload')}
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function CallbackDetail(props: { label: string; value: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 font-mono text-sm break-all'>{props.value}</div>
    </div>
  )
}

function callbackVerificationKey(
  status: PaymentCallbackEvent['verification_status']
) {
  const keys: Record<PaymentCallbackEvent['verification_status'], string> = {
    pending: 'Pending',
    verified: 'Verified',
    rejected: 'Rejected',
  }
  return keys[status]
}
