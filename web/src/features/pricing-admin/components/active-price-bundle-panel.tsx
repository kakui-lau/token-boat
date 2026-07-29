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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { getActivePriceBundle } from '../api'
import type { PurchasePriceVersion, RetailPriceVersion } from '../types'

type ActivePriceBundlePanelProps = {
  channelModelId: number
  purchaseVersions: PurchasePriceVersion[]
  retailVersions: RetailPriceVersion[]
}

export function ActivePriceBundlePanel(props: ActivePriceBundlePanelProps) {
  const { t } = useTranslation()
  const bundleQuery = useQuery({
    queryKey: ['pricing-admin', 'active-price-bundle', props.channelModelId],
    queryFn: () => getActivePriceBundle(props.channelModelId),
    retry: false,
  })
  const bundle = bundleQuery.data?.data
  const activePurchase = props.purchaseVersions.find(
    (version) => version.status === 'active'
  )
  const linkedActiveRetail = activePurchase
    ? props.retailVersions.find(
        (version) =>
          version.status === 'active' &&
          version.purchase_price_version_id === activePurchase.id
      )
    : undefined
  let readinessMessage = t(
    'The active price chain is being refreshed. Retry if it does not appear shortly.'
  )
  if (!activePurchase) {
    readinessMessage = t(
      'Publish a purchase price to start the active version chain.'
    )
  } else if (!linkedActiveRetail) {
    readinessMessage = t(
      'Publish a retail price linked to purchase version {{version}} to complete the active version chain.',
      { version: activePurchase.version }
    )
  }

  return (
    <Card size='sm'>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle>{t('Active Version Chain')}</CardTitle>
        <Badge variant={bundle ? 'default' : 'outline'}>
          {bundle ? t('active') : t('Not configured')}
        </Badge>
      </CardHeader>
      <CardContent>
        {bundleQuery.isLoading ? <Skeleton className='h-14 w-full' /> : null}
        {!bundleQuery.isLoading && !bundle ? (
          <p className='text-muted-foreground text-sm'>{readinessMessage}</p>
        ) : null}
        {bundle ? (
          <div className='grid gap-3 text-sm sm:grid-cols-3'>
            <div>
              <p className='text-muted-foreground'>{t('Official')}</p>
              <p className='font-medium'>
                {bundle.official_price
                  ? `${t('Version')} ${bundle.official_price.version}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>{t('Purchase')}</p>
              <p className='font-medium'>
                {t('Version')} {bundle.purchase_price.version}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>{t('Retail')}</p>
              <p className='font-medium'>
                {t('Version')} {bundle.retail_price.version}
              </p>
            </div>
            <p className='text-muted-foreground min-w-0 truncate font-mono text-xs sm:col-span-3'>
              {t('Revision')}: {bundle.revision}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
