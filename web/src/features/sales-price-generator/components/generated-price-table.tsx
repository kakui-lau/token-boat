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

import { Calculator, Download } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  parseEffectiveRateDetails,
  type ParsedRateDetails,
} from '../lib/parse-effective-rate-details'
import { calculateVariableCostPercentage } from '../lib/variable-cost-rate'
import type {
  GeneratedSalesPriceRow,
  RowRateValues,
  SalesPriceGenerationResponse,
} from '../types'

type GeneratedPriceTableProps = {
  result?: SalesPriceGenerationResponse['data']
  regeneratingRowIds?: Set<number>
  onRowRegenerate?: (modelId: number, rates: ParsedRateDetails) => void
  rates?: Record<number, RowRateValues>
  onRatesChange?: (modelId: number, next: RowRateValues) => void
  canExport?: boolean
  hasGeneratedData?: boolean
  isExporting?: boolean
  onExport?: () => void
}

function channelLabel(index: number): string {
  let label = ''
  for (
    let remaining = index;
    remaining >= 0;
    remaining = Math.floor(remaining / 26) - 1
  ) {
    label = String.fromCharCode(65 + (remaining % 26)) + label
  }
  return label
}

const emptyRowRates: RowRateValues = {
  payment_processing_fee_rate: '',
  distribution_fee_rate: '',
  operations_labor_cost_rate: '',
  effective_tax_rate: '',
  target_net_margin: '',
}

function EditableRateCells({
  row,
  regeneratingRowIds,
  onRowRegenerate,
  rates,
  onRatesChange,
}: {
  row: GeneratedSalesPriceRow
  regeneratingRowIds: Set<number>
  onRowRegenerate?: (modelId: number, rates: ParsedRateDetails) => void
  rates?: RowRateValues
  onRatesChange?: (modelId: number, next: RowRateValues) => void
}) {
  const { t } = useTranslation()
  const isRegenerating = regeneratingRowIds.has(row.model_id)
  const values: RowRateValues = rates ?? emptyRowRates
  // Keep a ref so the debounce effect doesn't fire when the callback identity changes
  const onRowRegenerateRef = useRef(onRowRegenerate)
  onRowRegenerateRef.current = onRowRegenerate

  // Combined VCR derived from the three editable components
  const vcr = calculateVariableCostPercentage([
    values.payment_processing_fee_rate,
    values.distribution_fee_rate,
    values.operations_labor_cost_rate,
  ])

  // Debounce: when the user edits any rate, wait 500ms then trigger
  // regeneration with the combined VCR and current TR/TM values.
  useEffect(() => {
    if (!vcr || !values.effective_tax_rate || !values.target_net_margin) {
      return // don't regenerate with empty/invalid fields
    }
    const current = parseEffectiveRateDetails(row.effective_rate_details)
    if (
      Number(vcr) === Number(current.vcr) &&
      Number(values.effective_tax_rate) === Number(current.tr) &&
      Number(values.target_net_margin) === Number(current.tm)
    ) {
      return // nothing changed — skip
    }

    const timer = setTimeout(() => {
      onRowRegenerateRef.current?.(row.model_id, {
        vcr,
        tr: values.effective_tax_rate,
        tm: values.target_net_margin,
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [
    vcr,
    values.effective_tax_rate,
    values.target_net_margin,
    row.effective_rate_details,
    row.model_id,
  ])

  const fields: Array<{
    key: keyof RowRateValues
    label: string
  }> = [
    { key: 'payment_processing_fee_rate', label: t('Payment processing fee') },
    { key: 'distribution_fee_rate', label: t('Distribution fee') },
    { key: 'operations_labor_cost_rate', label: t('Operations labor cost') },
    { key: 'effective_tax_rate', label: t('TR') },
    { key: 'target_net_margin', label: t('TM') },
  ]

  return (
    <>
      {fields.map((field) => (
        <TableCell key={field.key}>
          {isRegenerating ? (
            <Spinner data-testid={`${field.key}-spinner-${row.model_id}`} />
          ) : (
            <InputGroup className='w-20'>
              <InputGroupInput
                type='number'
                value={values[field.key]}
                onChange={(e) =>
                  onRatesChange?.(row.model_id, {
                    ...values,
                    [field.key]: e.target.value,
                  })
                }
                aria-label={field.label}
              />
              <InputGroupAddon align='inline-end'>%</InputGroupAddon>
            </InputGroup>
          )}
        </TableCell>
      ))}
    </>
  )
}

export function GeneratedPriceTable(props: GeneratedPriceTableProps) {
  const { t } = useTranslation()
  const maximumChannelCount = props.result?.maximum_channel_count ?? 0
  const regeneratingRowIds = props.regeneratingRowIds ?? new Set<number>()

  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>{t('Generated sales price table')}</CardTitle>
        <CardDescription>
          {t(
            'Each model occupies one row, with channel columns added dynamically.'
          )}
        </CardDescription>
        {props.canExport ? (
          <CardAction>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={!props.hasGeneratedData || props.isExporting}
              onClick={props.onExport}
            >
              {props.isExporting ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <Download data-icon='inline-start' />
              )}
              {t('Export generated table')}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {!props.result ? (
          <Empty className='min-h-44'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Calculator />
              </EmptyMedia>
              <EmptyTitle>{t('No generated sales prices')}</EmptyTitle>
              <EmptyDescription>
                {t('Set the rates and click Generate sales prices.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {props.result && props.result.items.length === 0 ? (
          <Empty className='min-h-44'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Calculator />
              </EmptyMedia>
              <EmptyTitle>{t('No generated sales prices')}</EmptyTitle>
              <EmptyDescription>
                {t('No supported channel models are available for generation.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {props.result && props.result.items.length > 0 ? (
          <div
            data-testid='generated-price-scroll'
            className='rounded-lg border'
          >
            <Table className='min-w-max'>
              <TableHeader className='bg-card sticky top-0 z-10'>
                <TableRow>
                  <TableHead>{t('Model Name')}</TableHead>
                  <TableHead>{t('Payment processing fee')}</TableHead>
                  <TableHead>{t('Distribution fee')}</TableHead>
                  <TableHead>{t('Operations labor cost')}</TableHead>
                  <TableHead>{t('TR')}</TableHead>
                  <TableHead>{t('TM')}</TableHead>
                  <TableHead>{t('Minimum sales discount')}</TableHead>
                  <TableHead>{t('Minimum purchase discount')}</TableHead>
                  {Array.from({ length: maximumChannelCount }, (_, index) => {
                    const label = channelLabel(index)
                    return [
                      <TableHead key={`${label}-name`}>
                        {t('Channel {{label}} name', { label })}
                      </TableHead>,
                      <TableHead key={`${label}-purchase`}>
                        {t('Channel {{label}} purchase discount', { label })}
                      </TableHead>,
                      <TableHead key={`${label}-sales`}>
                        {t('Channel {{label}} sales discount', { label })}
                      </TableHead>,
                    ]
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.result.items.map((item) => (
                  <TableRow key={item.model_id}>
                    <TableCell className='font-medium'>
                      {item.model_name}
                    </TableCell>
                    <EditableRateCells
                      row={item}
                      regeneratingRowIds={regeneratingRowIds}
                      onRowRegenerate={props.onRowRegenerate}
                      rates={props.rates?.[item.model_id]}
                      onRatesChange={props.onRatesChange}
                    />
                    <TableCell>{item.minimum_retail_discount || '—'}</TableCell>
                    <TableCell>
                      {item.minimum_purchase_discount || '—'}
                    </TableCell>
                    {Array.from({ length: maximumChannelCount }, (_, index) => {
                      const channel = item.channels[index]
                      const label = channelLabel(index)
                      return [
                        <TableCell key={`${label}-name`}>
                          {channel?.channel_name || '—'}
                        </TableCell>,
                        <TableCell key={`${label}-purchase`}>
                          {channel?.purchase_discount || '—'}
                        </TableCell>,
                        <TableCell key={`${label}-sales`}>
                          {channel?.retail_discount || '—'}
                        </TableCell>,
                      ]
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
