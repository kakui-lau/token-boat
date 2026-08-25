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
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

import { getPricingRuntimeStatus } from '../api'

export function PricingRuntimeStatus() {
  const { t } = useTranslation()
  const statusQuery = useQuery({
    queryKey: ['pricing-admin', 'runtime-status'],
    queryFn: getPricingRuntimeStatus,
  })
  const runtime = statusQuery.data?.data
  if (!runtime) {
    return null
  }
  const runtimeTitle = runtime.live_traffic_enabled
    ? t('Pricing routing and billing are active')
    : t('Pricing routing unavailable')
  const runtimeDescription = runtime.live_traffic_enabled
    ? t(
        'Eligible requests use purchase-cost routing and frozen sales-price settlement.'
      )
    : t(
        'Requests cannot be routed until purchase prices and sales price books are complete.'
      )

  return (
    <Alert>
      {runtime.live_traffic_enabled ? <CircleCheck /> : <CircleAlert />}
      <AlertTitle>{runtimeTitle}</AlertTitle>
      <AlertDescription>
        <p>{runtimeDescription}</p>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Badge variant='outline'>
            {t('{{priced}} of {{total}} channel models have purchase pricing', {
              priced: runtime.priced_channel_models,
              total: runtime.total_channel_models,
            })}
          </Badge>
          <Badge
            variant={runtime.toc_default_ready ? 'outline' : 'destructive'}
          >
            {runtime.toc_default_ready
              ? t('TOC default price book is ready')
              : t(
                  runtime.toc_default_error ||
                    'TOC default price book is unavailable'
                )}
          </Badge>
          <Badge variant='outline'>
            {t('{{count}} model/group scopes are ready', {
              count: runtime.complete_group_model_scopes,
            })}
          </Badge>
          <Badge
            variant={
              runtime.distributed_circuit_state ? 'outline' : 'destructive'
            }
          >
            {runtime.distributed_circuit_state
              ? t('Distributed circuit state is active')
              : t(
                  'Circuit state is local to this instance; configure Redis before running multiple replicas.'
                )}
          </Badge>
          {Object.entries({
            [t('Cost')]: runtime.route_score_weights.cost,
            [t('Success rate')]: runtime.route_score_weights.success,
            [t('Latency')]: runtime.route_score_weights.latency,
            [t('Quality')]: runtime.route_score_weights.quality,
          }).map(([label, weight]) => (
            <Badge key={label} variant='secondary'>
              {label}: {(weight * 100).toFixed(0)}%
            </Badge>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  )
}
