/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  priceComponentLabels,
  type PriceRule,
  readPriceComponents,
} from '../lib/price-components'
import { storedRateToPercentage } from '../lib/rate-format'
import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'

type PurchasePriceComparisonProps = {
  purchase: PurchasePriceVersion
  officialVersion?: OfficialPriceVersion
}

type ComparisonRow = {
  key: string
  name: string
  label: string
  conditions: string[]
  officialPrice: string
  purchasePrice: string
  discount: string
  unit: string
  unitSize: string
}

const discountKeys: Record<string, string> = {
  input_unit_price: 'input_discount',
  output_unit_price: 'output_discount',
  cache_read_unit_price: 'cache_read_discount',
  cache_write_unit_price: 'cache_write_discount',
  image_input_unit_price: 'image_input_discount',
  image_output_unit_price: 'image_output_discount',
  audio_input_unit_price: 'audio_input_discount',
  audio_output_unit_price: 'audio_output_discount',
}

function readStringRecord(raw?: string): Record<string, string> {
  const parsed = readPriceComponents(raw)
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string' || typeof value === 'number') {
      values[key] = String(value)
    }
  }
  return values
}

function formatDiscount(discount: string): string {
  return discount ? `${storedRateToPercentage(discount)}%` : '—'
}

function formatPrice(
  value: string,
  currency: string,
  unit: string,
  unitSize: string
): string {
  if (!value) {
    return '—'
  }
  return unit
    ? `${value} ${currency} / ${unitSize || '1'} ${unit}`
    : `${value} ${currency}`
}

export function PurchasePriceComparison(props: PurchasePriceComparisonProps) {
  const { t } = useTranslation()
  const purchaseComponents = readPriceComponents(
    props.purchase.price_components
  )
  const officialComponents = readPriceComponents(
    props.officialVersion?.price_components
  )
  const purchaseRules = Array.isArray(purchaseComponents.rules)
    ? (purchaseComponents.rules as PriceRule[])
    : []
  const officialRules = Array.isArray(officialComponents.rules)
    ? (officialComponents.rules as PriceRule[])
    : []
  const discountSpec = readStringRecord(props.purchase.quote_spec)
  const defaultDiscount =
    props.purchase.pricing_mode === 'official_ratio'
      ? props.purchase.purchase_discount
      : ''

  let rows: ComparisonRow[] = []
  if (purchaseRules.length > 0) {
    rows = purchaseRules.map((purchaseRule, index) => {
      const officialRule =
        (purchaseRule.id
          ? officialRules.find((rule) => rule.id === purchaseRule.id)
          : undefined) ?? officialRules[index]
      const conditions = [
        purchaseRule.operation &&
          `${t('Operation')}: ${purchaseRule.operation}`,
        purchaseRule.quality && `${t('Quality')}: ${purchaseRule.quality}`,
        purchaseRule.resolution &&
          `${t('Resolution')}: ${purchaseRule.resolution}`,
        purchaseRule.with_audio === 'true' && t('With audio'),
        purchaseRule.with_audio === 'false' && t('Without audio'),
        purchaseRule.upper_bound &&
          `${t('Usage upper bound')}: ${purchaseRule.upper_bound}`,
      ].filter((value): value is string => Boolean(value))
      let unit = ''
      if (purchaseRule.unit) {
        unit = t(purchaseRule.unit)
      } else if (officialRule?.unit) {
        unit = t(officialRule.unit)
      }
      return {
        key: purchaseRule.id || `${purchaseRule.component}-${index}`,
        name: purchaseRule.name || `#${index + 1}`,
        label: t(
          priceComponentLabels[purchaseRule.component || ''] ??
            purchaseRule.component ??
            'Price rule'
        ),
        conditions,
        officialPrice: officialRule?.unit_price || '',
        purchasePrice: purchaseRule.unit_price || '',
        discount: defaultDiscount,
        unit,
        unitSize: purchaseRule.unit_size || officialRule?.unit_size || '1',
      }
    })
  } else {
    const purchaseValues = readStringRecord(props.purchase.price_components)
    purchaseValues.input_unit_price ||= props.purchase.input_unit_price || ''
    purchaseValues.output_unit_price ||= props.purchase.output_unit_price || ''
    purchaseValues.cache_read_unit_price ||=
      props.purchase.cache_read_unit_price || ''
    purchaseValues.cache_write_unit_price ||=
      props.purchase.cache_write_unit_price || ''
    const officialValues = readStringRecord(
      props.officialVersion?.price_components
    )
    const keys = [
      ...new Set([
        ...Object.keys(officialValues),
        ...Object.keys(purchaseValues),
      ]),
    ].filter(
      (key) =>
        !key.startsWith('legacy_') &&
        key !== 'price_unit' &&
        key !== 'schema_version' &&
        Boolean(officialValues[key] || purchaseValues[key])
    )
    rows = keys.map((key) => ({
      key,
      name: '',
      label: t(priceComponentLabels[key] ?? key),
      conditions: [],
      officialPrice: officialValues[key] || '',
      purchasePrice: purchaseValues[key] || '',
      discount:
        props.purchase.pricing_mode === 'component_ratio'
          ? discountSpec[discountKeys[key]] || ''
          : defaultDiscount,
      unit: '',
      unitSize: '',
    }))
  }

  return (
    <section className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-medium'>{t('Price Comparison')}</h3>
        {props.purchase.official_price_version_id && !props.officialVersion ? (
          <Badge variant='destructive'>{t('Official price unavailable')}</Badge>
        ) : null}
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Price Components')}</TableHead>
              <TableHead>{t('Official Price')}</TableHead>
              <TableHead>{t('Discount')}</TableHead>
              <TableHead>{t('Purchase Price')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className='min-w-48'>
                  <div className='flex flex-wrap items-center gap-2'>
                    {row.name ? (
                      <Badge variant='outline'>{row.name}</Badge>
                    ) : null}
                    <p className='font-medium'>{row.label}</p>
                  </div>
                  {row.conditions.length > 0 ? (
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {row.conditions.join(' · ')}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap'>
                  {formatPrice(
                    row.officialPrice,
                    props.officialVersion?.currency || props.purchase.currency,
                    row.unit,
                    row.unitSize
                  )}
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {props.purchase.pricing_mode === 'fixed_unit_price'
                    ? t('Fixed Prices')
                    : formatDiscount(row.discount)}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap'>
                  {formatPrice(
                    row.purchasePrice,
                    props.purchase.currency,
                    row.unit,
                    row.unitSize
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className='text-muted-foreground text-center'
                >
                  {t('No structured price components')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
