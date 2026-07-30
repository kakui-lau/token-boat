import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { getRequestPricingSnapshots } from '../api'

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
  const rows = snapshotsQuery.data?.data.items ?? []
  const total = snapshotsQuery.data?.data.total ?? 0

  return (
    <section className='space-y-3' aria-labelledby='pricing-reconciliation'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 id='pricing-reconciliation' className='font-medium'>
            {t('Pricing Reconciliation')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t('{{total}} pricing snapshots require review', { total })}
          </p>
        </div>
        <Button
          size='sm'
          variant='outline'
          disabled={snapshotsQuery.isFetching}
          onClick={() => snapshotsQuery.refetch()}
        >
          <RefreshCw aria-hidden='true' />
          {t('Refresh')}
        </Button>
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
                  {t('No pricing snapshots require review')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
