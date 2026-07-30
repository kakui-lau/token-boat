import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Download, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  getPricingReconciliationSummary,
  getRequestPricingSnapshots,
} from '../api'

export function PricingReconciliationPanel() {
  const { t } = useTranslation()
  const snapshotsQuery = useQuery({
    queryKey: ['pricing-admin', 'request-pricing-snapshots', 'pending'],
    queryFn: () =>
      getRequestPricingSnapshots({
        reconciliation: true,
        page: 1,
        page_size: 20,
      }),
  })
  const summaryQuery = useQuery({
    queryKey: ['pricing-admin', 'request-pricing-snapshots', 'summary'],
    queryFn: getPricingReconciliationSummary,
  })
  const rows = snapshotsQuery.data?.data.items ?? []
  const total = snapshotsQuery.data?.data.total ?? 0

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
            {t('{{total}} billing anomalies', { total })}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            size='sm'
            variant='outline'
            render={
              <a
                href='/api/pricing-admin/request-pricing-snapshots/export?reconciliation=true'
                download
              />
            }
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
              <TableHead>{t('Status')}</TableHead>
              <TableHead>{t('Updated')}</TableHead>
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
                <TableCell>
                  <Badge
                    variant={row.status === 'pending' ? 'default' : 'secondary'}
                  >
                    {row.status === 'pending' ? t('Pending') : t('Reserved')}
                  </Badge>
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {dayjs.unix(row.updated_at).format('YYYY-MM-DD HH:mm')}
                </TableCell>
              </TableRow>
            ))}
            {!snapshotsQuery.isLoading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className='text-muted-foreground h-20 text-center'
                >
                  {t('No billing anomalies')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
