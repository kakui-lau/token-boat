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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getModelPriceOverview } from '@/features/pricing-admin/api'
import type {
  ModelPriceOverview,
  ProviderPriceEndpoint,
} from '@/features/pricing-admin/types'

const emptyOverviewItems: ModelPriceOverview[] = []

function PriceCell(props: {
  endpoint: ProviderPriceEndpoint
  kind: 'purchase' | 'retail'
  currency: string
}) {
  const { t } = useTranslation()
  const isPurchase = props.kind === 'purchase'
  const currency = isPurchase
    ? props.endpoint.purchase_currency || props.currency
    : props.currency
  const input = isPurchase
    ? props.endpoint.purchase_input_unit_price
    : props.endpoint.retail_input_unit_price
  const output = isPurchase
    ? props.endpoint.purchase_output_unit_price
    : props.endpoint.retail_output_unit_price

  if (!input && !output) {
    return <span className='text-muted-foreground'>—</span>
  }

  return (
    <div className='space-y-1 text-xs'>
      <p>
        <span className='text-muted-foreground'>{t('Input')}:</span>{' '}
        <span className='font-mono tabular-nums'>
          {input || '—'} {currency}
        </span>
      </p>
      <p>
        <span className='text-muted-foreground'>{t('Output')}:</span>{' '}
        <span className='font-mono tabular-nums'>
          {output || '—'} {currency}
        </span>
      </p>
    </div>
  )
}

export function PriceComparison() {
  const { t } = useTranslation()
  const [overviewKey, setOverviewKey] = useState('')
  const [selectedChannelModelIds, setSelectedChannelModelIds] = useState<
    number[]
  >([])
  const overviewQuery = useQuery({
    queryKey: ['pricing-admin', 'model-price-overview'],
    queryFn: () => getModelPriceOverview(),
  })
  const items = overviewQuery.data?.data ?? emptyOverviewItems
  const selectedItem =
    items.find((item) => `${item.model_id}:${item.currency}` === overviewKey) ??
    null

  useEffect(() => {
    if (!overviewKey && items.length > 0) {
      setOverviewKey(`${items[0].model_id}:${items[0].currency}`)
    }
  }, [items, overviewKey])

  useEffect(() => {
    setSelectedChannelModelIds([])
  }, [overviewKey])

  const selectedEndpoints =
    selectedItem?.endpoints.filter((endpoint) =>
      selectedChannelModelIds.includes(endpoint.channel_model_id)
    ) ?? []

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Price Comparison')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='h-full space-y-5 overflow-auto'>
          <div className='grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_1fr]'>
            <Field>
              <FieldLabel htmlFor='price-comparison-model'>
                {t('Model')}
              </FieldLabel>
              <NativeSelect
                id='price-comparison-model'
                className='w-full'
                value={overviewKey}
                onChange={(event) => setOverviewKey(event.target.value)}
              >
                <NativeSelectOption value=''>
                  {t('Select a model')}
                </NativeSelectOption>
                {items.map((item) => (
                  <NativeSelectOption
                    key={`${item.model_id}:${item.currency}`}
                    value={`${item.model_id}:${item.currency}`}
                  >
                    {item.model_name} · {item.currency}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>{t('Channels')}</FieldLabel>
              <div className='bg-background/70 flex min-h-8 flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border px-3 py-2'>
                {selectedItem?.endpoints.map((endpoint) => {
                  const checked = selectedChannelModelIds.includes(
                    endpoint.channel_model_id
                  )
                  return (
                    <label
                      key={endpoint.channel_model_id}
                      className='flex cursor-pointer items-center gap-2 text-sm'
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedChannelModelIds((current) =>
                            nextChecked
                              ? [...current, endpoint.channel_model_id]
                              : current.filter(
                                  (id) => id !== endpoint.channel_model_id
                                )
                          )
                        }}
                      />
                      <span>{endpoint.channel_name}</span>
                    </label>
                  )
                })}
                {selectedItem && selectedItem.endpoints.length === 0 ? (
                  <span className='text-muted-foreground text-sm'>
                    {t('No active retail prices found')}
                  </span>
                ) : null}
                {!selectedItem ? (
                  <span className='text-muted-foreground text-sm'>
                    {t('No channels selected')}
                  </span>
                ) : null}
              </div>
            </Field>
          </div>

          {overviewQuery.isLoading ? (
            <Skeleton className='h-64 w-full' />
          ) : null}

          {!overviewQuery.isLoading ? (
            <div className='bg-background/70 overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Channel')}</TableHead>
                    <TableHead>{t('Model')}</TableHead>
                    <TableHead>{t('Billing')}</TableHead>
                    <TableHead>{t('Purchase Price')}</TableHead>
                    <TableHead>{t('Retail Price')}</TableHead>
                    <TableHead>{t('Target Margin')}</TableHead>
                    <TableHead>{t('Runtime')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedEndpoints.map((endpoint) => {
                    const margin = Number(endpoint.target_net_margin)
                    return (
                      <TableRow key={endpoint.channel_model_id}>
                        <TableCell className='font-medium'>
                          {endpoint.channel_name}
                        </TableCell>
                        <TableCell>{endpoint.upstream_model_name}</TableCell>
                        <TableCell>
                          <p>{t(endpoint.billing_mode)}</p>
                          <p className='text-muted-foreground text-xs'>
                            {t(endpoint.price_structure)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <PriceCell
                            endpoint={endpoint}
                            kind='purchase'
                            currency={selectedItem?.currency ?? ''}
                          />
                        </TableCell>
                        <TableCell>
                          <PriceCell
                            endpoint={endpoint}
                            kind='retail'
                            currency={selectedItem?.currency ?? ''}
                          />
                        </TableCell>
                        <TableCell>
                          {Number.isFinite(margin)
                            ? `${(margin * 100).toFixed(1)}%`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              endpoint.runtime_mode === 'v2'
                                ? 'default'
                                : 'outline'
                            }
                          >
                            {endpoint.runtime_mode === 'v2'
                              ? t('V2 Pricing')
                              : t('Legacy Billing')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {selectedEndpoints.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className='text-muted-foreground h-28 text-center'
                      >
                        {t('No channels selected')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
