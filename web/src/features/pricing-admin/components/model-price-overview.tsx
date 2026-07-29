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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type {
  LowestPriceComponent,
  ModelPriceOverview as ModelPriceOverviewItem,
  ProviderPriceEndpoint,
} from '../types'

type ModelPriceOverviewProps = {
  items: ModelPriceOverviewItem[]
  isLoading: boolean
}

function LowestPrice({ value }: { value?: LowestPriceComponent }) {
  if (!value) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <div>
      <p className='font-mono'>
        {value.unit_price} {value.currency}
      </p>
      <p className='text-muted-foreground text-xs'>{value.channel_name}</p>
    </div>
  )
}

function EndpointPrice(props: {
  value?: string
  currency: string
  isLowest?: boolean
}) {
  const { t } = useTranslation()
  if (!props.value) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <div className='flex items-center gap-2'>
      <span className='font-mono tabular-nums'>
        {props.value} {props.currency}
      </span>
      {props.isLowest ? (
        <Badge variant='secondary' className='text-xs'>
          {t('Lowest')}
        </Badge>
      ) : null}
    </div>
  )
}

type StructuredPriceRule = {
  id?: string
  name?: string
  resolution?: string
  quality?: string
  unit?: string
  unit_size?: string
  unit_price?: string
}

function readStructuredRules(value?: string): StructuredPriceRule[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as { rules?: StructuredPriceRule[] }
    return Array.isArray(parsed.rules) ? parsed.rules : []
  } catch {
    return []
  }
}

function PriceSummary(props: {
  endpoint: ProviderPriceEndpoint
  item: ModelPriceOverviewItem
  kind: 'purchase' | 'retail'
}) {
  const { t } = useTranslation()
  const isPurchase = props.kind === 'purchase'
  const currency = isPurchase
    ? props.endpoint.purchase_currency || props.item.currency
    : props.item.currency
  const input = isPurchase
    ? props.endpoint.purchase_input_unit_price
    : props.endpoint.retail_input_unit_price
  const output = isPurchase
    ? props.endpoint.purchase_output_unit_price
    : props.endpoint.retail_output_unit_price
  const rules = readStructuredRules(
    isPurchase
      ? props.endpoint.purchase_price_components
      : props.endpoint.retail_price_components
  )

  if (input || output) {
    return (
      <div className='space-y-1'>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground w-12 text-xs'>
            {t('Input')}
          </span>
          <EndpointPrice
            value={input}
            currency={currency}
            isLowest={
              !isPurchase &&
              props.item.input?.channel_model_id ===
                props.endpoint.channel_model_id
            }
          />
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground w-12 text-xs'>
            {t('Output')}
          </span>
          <EndpointPrice
            value={output}
            currency={currency}
            isLowest={
              !isPurchase &&
              props.item.output?.channel_model_id ===
                props.endpoint.channel_model_id
            }
          />
        </div>
      </div>
    )
  }

  if (rules.length === 0) {
    return <span className='text-muted-foreground'>—</span>
  }

  return (
    <div className='space-y-1'>
      {rules.slice(0, 4).map((rule, index) => (
        <p key={rule.id || `${rule.name}-${index}`} className='text-xs'>
          <span className='text-muted-foreground'>
            {rule.resolution || rule.quality || rule.name || t('Default')}:
          </span>{' '}
          <span className='font-mono'>
            {rule.unit_price || '—'} {currency}
          </span>
          {rule.unit ? (
            <span className='text-muted-foreground'>
              {' '}
              / {rule.unit_size || '1'} {t(rule.unit)}
            </span>
          ) : null}
        </p>
      ))}
      {rules.length > 4 ? (
        <p className='text-muted-foreground text-xs'>
          {t('+{{count}} more pricing rules', { count: rules.length - 4 })}
        </p>
      ) : null}
    </div>
  )
}

function EndpointRow(props: {
  endpoint: ProviderPriceEndpoint
  item: ModelPriceOverviewItem
}) {
  const { t } = useTranslation()
  const margin = Number(props.endpoint.target_net_margin)
  return (
    <TableRow>
      <TableCell>
        <p className='font-medium'>{props.endpoint.channel_name}</p>
        <p className='text-muted-foreground text-xs'>
          {props.endpoint.upstream_model_name}
        </p>
      </TableCell>
      <TableCell>
        <p>{t(props.endpoint.billing_mode)}</p>
        <p className='text-muted-foreground text-xs'>
          {t(props.endpoint.price_structure)}
        </p>
      </TableCell>
      <TableCell>
        <PriceSummary
          endpoint={props.endpoint}
          item={props.item}
          kind='purchase'
        />
      </TableCell>
      <TableCell>
        <PriceSummary
          endpoint={props.endpoint}
          item={props.item}
          kind='retail'
        />
      </TableCell>
      <TableCell>
        {Number.isFinite(margin) ? `${(margin * 100).toFixed(1)}%` : '—'}
      </TableCell>
      <TableCell>
        <Badge
          variant={props.endpoint.runtime_mode === 'v2' ? 'default' : 'outline'}
        >
          {props.endpoint.runtime_mode === 'v2'
            ? t('V2 Pricing')
            : t('Legacy Billing')}
        </Badge>
      </TableCell>
    </TableRow>
  )
}

export function ModelPriceOverview(props: ModelPriceOverviewProps) {
  const { t } = useTranslation()
  return (
    <section id='provider-price-comparison' className='scroll-mt-4 space-y-3'>
      <div>
        <h2 className='font-medium'>{t('Provider Price Comparison')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Compare active channel prices, upstream model mappings, margins, and runtime status.'
          )}
        </p>
      </div>
      {props.isLoading
        ? Array.from({ length: 3 }, (_, index) => (
            <Skeleton
              key={`price-overview-skeleton-${index}`}
              className='h-20 w-full'
            />
          ))
        : null}
      {!props.isLoading && props.items.length > 0 ? (
        <Accordion className='gap-3'>
          {props.items.map((item) => (
            <AccordionItem
              key={`${item.model_id}-${item.currency}`}
              value={`${item.model_id}-${item.currency}`}
              className='overflow-hidden rounded-lg border px-4'
            >
              <AccordionTrigger className='items-center py-4 hover:no-underline'>
                <div className='grid flex-1 gap-3 text-left lg:grid-cols-[minmax(14rem,1.5fr)_repeat(4,minmax(7rem,1fr))]'>
                  <div>
                    <p className='font-semibold'>{item.model_name}</p>
                    <p className='text-muted-foreground text-xs'>
                      {item.currency} ·{' '}
                      {t('{{count}} active endpoints', {
                        count: item.active_channel_count,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs'>
                      {t('Min Input')}
                    </p>
                    <LowestPrice value={item.input} />
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs'>
                      {t('Min Output')}
                    </p>
                    <LowestPrice value={item.output} />
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs'>
                      {t('Min Cache Read')}
                    </p>
                    <LowestPrice value={item.cache_read} />
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs'>
                      {t('Min Cache Write')}
                    </p>
                    <LowestPrice value={item.cache_write} />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className='pb-4'>
                {item.endpoints.every(
                  (endpoint) => endpoint.billing_mode === 'token'
                ) ? (
                  <p className='text-muted-foreground mb-3 text-xs'>
                    {t('Price unit: per 1M tokens')}
                  </p>
                ) : (
                  <p className='text-muted-foreground mb-3 text-xs'>
                    {t(
                      'Prices follow each endpoint billing unit and pricing conditions.'
                    )}
                  </p>
                )}
                <div className='overflow-x-auto rounded-lg border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Provider')}</TableHead>
                        <TableHead>{t('Billing')}</TableHead>
                        <TableHead>{t('Purchase Price')}</TableHead>
                        <TableHead>{t('Retail Price')}</TableHead>
                        <TableHead>{t('Target Margin')}</TableHead>
                        <TableHead>{t('Runtime')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.endpoints.map((endpoint) => (
                        <EndpointRow
                          key={endpoint.channel_model_id}
                          endpoint={endpoint}
                          item={item}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : null}
      {!props.isLoading && props.items.length === 0 ? (
        <div className='text-muted-foreground rounded-lg border py-10 text-center text-sm'>
          {t('No active retail prices found')}
        </div>
      ) : null}
    </section>
  )
}
