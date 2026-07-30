import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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

import { getPricingCircuitOverview, resetPricingCircuit } from '../api'
import type { ChannelCircuitEvent, ChannelCircuitStatus } from '../types'

function CircuitStateBadge(props: { state: ChannelCircuitStatus['state'] }) {
  const { t } = useTranslation()
  if (props.state === 'open') {
    return <Badge variant='destructive'>{t('Open')}</Badge>
  }
  if (props.state === 'half_open') {
    return <Badge variant='default'>{t('Half-open')}</Badge>
  }
  return <Badge variant='secondary'>{t('Monitoring')}</Badge>
}

function circuitEventLabel(
  event: ChannelCircuitEvent['event'],
  t: (key: string) => string
) {
  switch (event) {
    case 'failure':
      return t('Failure recorded')
    case 'opened':
      return t('Circuit opened')
    case 'rate_limited':
      return t('Rate limited')
    case 'half_open_probe':
      return t('Half-open probe')
    case 'recovered':
      return t('Recovered')
    case 'manual_reset':
      return t('Manually reset')
  }
}

export function PricingCircuitPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const circuitQuery = useQuery({
    queryKey: ['pricing-admin', 'circuit-overview'],
    queryFn: getPricingCircuitOverview,
  })
  const resetMutation = useMutation({
    mutationFn: resetPricingCircuit,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'circuit-overview'],
      })
    },
  })
  const channels = circuitQuery.data?.data.channels ?? []
  const events = (circuitQuery.data?.data.events ?? []).slice(-20).reverse()

  return (
    <section className='space-y-3' aria-labelledby='pricing-circuit-status'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 id='pricing-circuit-status' className='font-medium'>
            {t('Channel Circuit Status')}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Tracks channel failures, cooldowns, half-open probes, and recoveries in this process.'
            )}
          </p>
        </div>
        <Button
          size='sm'
          variant='outline'
          disabled={circuitQuery.isFetching}
          onClick={() => circuitQuery.refetch()}
        >
          <RefreshCw aria-hidden='true' />
          {t('Refresh')}
        </Button>
      </div>

      <div className='grid gap-3 xl:grid-cols-2'>
        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Channel')}</TableHead>
                <TableHead>{t('State')}</TableHead>
                <TableHead>{t('Consecutive failures')}</TableHead>
                <TableHead>{t('Cooldown until')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.channel_id}>
                  <TableCell>
                    <div>
                      {channel.channel_name || `#${channel.channel_id}`}
                    </div>
                    {channel.channel_name ? (
                      <div className='text-muted-foreground text-xs'>
                        #{channel.channel_id}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <CircuitStateBadge state={channel.state} />
                  </TableCell>
                  <TableCell>{channel.consecutive_failures}</TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {channel.open_until > 0
                      ? dayjs.unix(channel.open_until).format('HH:mm:ss')
                      : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={resetMutation.isPending}
                          />
                        }
                      >
                        {t('Reset circuit')}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('Reset this channel circuit?')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              'This only clears the circuit state in the current process. The channel will be eligible for routing immediately.'
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              resetMutation.mutate(channel.channel_id)
                            }
                          >
                            {t('Reset')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {!circuitQuery.isLoading && channels.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className='text-muted-foreground h-20 text-center'
                  >
                    {t('All channels are healthy')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className='overflow-x-auto rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Time')}</TableHead>
                <TableHead>{t('Channel')}</TableHead>
                <TableHead>{t('Event')}</TableHead>
                <TableHead>{t('Status code')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className='whitespace-nowrap'>
                    {dayjs.unix(event.occurred_at).format('HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    {event.channel_name || `#${event.channel_id}`}
                  </TableCell>
                  <TableCell>{circuitEventLabel(event.event, t)}</TableCell>
                  <TableCell>
                    {event.status_code > 0 ? event.status_code : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!circuitQuery.isLoading && events.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className='text-muted-foreground h-20 text-center'
                  >
                    {t('No circuit events')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  )
}
