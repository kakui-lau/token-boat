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
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

import {
  priceComponentLabels,
  type PriceRule,
  readPriceComponents,
} from '../../pricing-admin/lib/price-components'
import type { SalesPriceBookItem } from '../types'

type SalesPriceDetailsDialogProps = {
  item?: SalesPriceBookItem
  onOpenChange: (open: boolean) => void
}

type PriceTier = Record<string, unknown> & {
  name?: string
  upper_bound?: string
}

function structuredPriceEntries(
  values: Record<string, unknown>
): Array<[string, string]> {
  return Object.entries(values)
    .filter(
      ([key, value]) =>
        priceComponentLabels[key] !== undefined &&
        (typeof value === 'string' || typeof value === 'number') &&
        String(value).trim() !== ''
    )
    .map(([key, value]) => [key, String(value)])
}

function formatUnitPrice(value: string, currency: string): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return `${currency} ${value}`
  return `${currency} ${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
  }).format(parsed)}`
}

export function SalesPriceDetailsDialog(props: SalesPriceDetailsDialogProps) {
  const { t } = useTranslation()
  const item = props.item
  const components = readPriceComponents(item?.price_components)
  const rules = Array.isArray(components.rules)
    ? (components.rules as PriceRule[])
    : []
  const tiers = Array.isArray(components.tiers)
    ? (components.tiers.filter(
        (tier) => tier !== null && typeof tier === 'object'
      ) as PriceTier[])
    : []
  const flatEntries = structuredPriceEntries(components)
  const hasStructuredPrices =
    rules.length > 0 || tiers.length > 0 || flatEntries.length > 0

  return (
    <Dialog open={Boolean(item)} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Sales price details for {{model}}', {
              model: item?.model_name ?? '',
            })}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Itemized prices are a readable view. Actual billing follows the frozen billing expression.'
            )}
          </DialogDescription>
        </DialogHeader>

        {item ? (
          <div className='flex flex-col gap-4'>
            <Alert>
              <AlertTitle>{t('One customer sales price')}</AlertTitle>
              <AlertDescription>
                {t(
                  'All channels for this logical model share the same customer sales price. Channel purchase costs and margins may differ.'
                )}
              </AlertDescription>
            </Alert>

            {rules.length > 0 ? (
              <section className='flex flex-col gap-2'>
                <h3 className='font-medium'>{t('Price rules')}</h3>
                {rules.map((rule, index) => {
                  const conditions = [
                    rule.operation && `${t('Operation')}: ${rule.operation}`,
                    rule.quality && `${t('Quality')}: ${rule.quality}`,
                    rule.resolution && `${t('Resolution')}: ${rule.resolution}`,
                    rule.with_audio === 'true' && t('With audio'),
                    rule.with_audio === 'false' && t('Without audio'),
                    rule.upper_bound &&
                      `${t('Usage upper bound')}: ${rule.upper_bound}`,
                  ].filter((value): value is string => Boolean(value))
                  const componentLabel =
                    priceComponentLabels[rule.component ?? ''] ??
                    rule.component ??
                    'Price rule'

                  return (
                    <article
                      key={rule.id || `${rule.component}-${index}`}
                      className='rounded-lg border p-3'
                    >
                      <div className='flex flex-wrap items-start justify-between gap-2'>
                        <div className='flex min-w-0 flex-wrap items-center gap-2'>
                          <Badge variant='outline'>
                            {rule.name || `#${index + 1}`}
                          </Badge>
                          <span className='font-medium'>
                            {t(componentLabel)}
                          </span>
                        </div>
                        <span className='font-mono tabular-nums'>
                          {formatUnitPrice(
                            rule.unit_price || '0',
                            item.currency
                          )}{' '}
                          / {rule.unit_size || '1'} {rule.unit || ''}
                        </span>
                      </div>
                      {conditions.length > 0 ? (
                        <p className='text-muted-foreground mt-2 text-xs break-words'>
                          {conditions.join(' · ')}
                        </p>
                      ) : null}
                    </article>
                  )
                })}
              </section>
            ) : null}

            {rules.length === 0 && tiers.length > 0 ? (
              <section className='flex flex-col gap-3'>
                <h3 className='font-medium'>{t('Price components')}</h3>
                {tiers.map((tier, index) => {
                  const entries = structuredPriceEntries(tier)
                  let upperBound = tier.upper_bound ?? ''
                  const upperBoundNumber = Number(upperBound)
                  if (Number.isFinite(upperBoundNumber)) {
                    upperBound = new Intl.NumberFormat().format(
                      upperBoundNumber
                    )
                  }
                  return (
                    <article
                      key={JSON.stringify(tier)}
                      className='overflow-hidden rounded-lg border'
                    >
                      <header className='bg-muted/40 flex flex-wrap items-center gap-2 border-b px-3 py-2.5'>
                        <Badge variant='outline'>
                          {tier.name || `${t('Tier')} ${index + 1}`}
                        </Badge>
                        {tier.upper_bound ? (
                          <span className='text-muted-foreground text-xs'>
                            ≤ {upperBound} {t('tokens')}
                          </span>
                        ) : null}
                      </header>
                      <dl className='bg-border grid gap-px sm:grid-cols-2 lg:grid-cols-4'>
                        {entries.map(([key, value]) => (
                          <div key={key} className='bg-background p-3'>
                            <dt className='text-muted-foreground text-xs'>
                              {t(priceComponentLabels[key])}
                            </dt>
                            <dd className='mt-1 font-mono font-medium tabular-nums'>
                              {formatUnitPrice(value, item.currency)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  )
                })}
              </section>
            ) : null}

            {rules.length === 0 &&
            tiers.length === 0 &&
            flatEntries.length > 0 ? (
              <section className='flex flex-col gap-2'>
                <h3 className='font-medium'>{t('Price components')}</h3>
                <dl className='grid gap-2 sm:grid-cols-2'>
                  {flatEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className='flex items-center justify-between gap-4 rounded-lg border p-3'
                    >
                      <dt className='text-muted-foreground text-sm'>
                        {t(priceComponentLabels[key])}
                      </dt>
                      <dd className='font-mono font-medium tabular-nums'>
                        {formatUnitPrice(value, item.currency)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {!hasStructuredPrices ? (
              <Empty className='min-h-28'>
                <EmptyHeader>
                  <EmptyTitle>{t('No structured price components')}</EmptyTitle>
                  <EmptyDescription>
                    {t(
                      'Use the technical billing expression below to review this price.'
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}

            <Collapsible>
              <CollapsibleTrigger
                render={<Button size='sm' variant='outline' />}
              >
                {t('View technical billing expression')}
              </CollapsibleTrigger>
              <CollapsibleContent className='mt-2'>
                <pre className='bg-muted max-h-72 overflow-auto rounded-lg border p-4 text-xs break-all whitespace-pre-wrap'>
                  {item.sales_billing_expr}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
