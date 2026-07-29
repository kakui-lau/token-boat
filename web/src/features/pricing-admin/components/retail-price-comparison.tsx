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
import type {
  OfficialPriceVersion,
  PurchasePriceVersion,
  RetailPriceVersion,
} from '../types'

type RetailPriceComparisonProps = {
  retail: RetailPriceVersion
  purchaseVersion?: PurchasePriceVersion
  officialVersion?: OfficialPriceVersion
}

type ComparisonRow = {
  key: string
  name: string
  label: string
  conditions: string[]
  officialPrice: string
  purchasePrice: string
  retailPrice: string
  unit: string
  unitSize: string
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

function readSnapshotPrices(
  version?: PurchasePriceVersion | RetailPriceVersion
): Record<string, string> {
  if (!version) {
    return {}
  }
  const values = readStringRecord(version.price_components)
  values.input_unit_price ||= version.input_unit_price || ''
  values.output_unit_price ||= version.output_unit_price || ''
  values.cache_read_unit_price ||= version.cache_read_unit_price || ''
  values.cache_write_unit_price ||= version.cache_write_unit_price || ''
  return values
}

function readRules(raw?: string): PriceRule[] {
  const components = readPriceComponents(raw)
  return Array.isArray(components.rules)
    ? (components.rules as PriceRule[])
    : []
}

function findRule(
  rules: PriceRule[],
  reference: PriceRule,
  index: number
): PriceRule | undefined {
  if (reference.id) {
    const exactMatch = rules.find((rule) => rule.id === reference.id)
    if (exactMatch) {
      return exactMatch
    }
  }
  return rules[index]
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

export function RetailPriceComparison(props: RetailPriceComparisonProps) {
  const { t } = useTranslation()
  const officialRules = readRules(props.officialVersion?.price_components)
  const purchaseRules = readRules(props.purchaseVersion?.price_components)
  const retailRules = readRules(props.retail.price_components)
  const ruleCount = Math.max(
    officialRules.length,
    purchaseRules.length,
    retailRules.length
  )

  let rows: ComparisonRow[] = []
  if (ruleCount > 0) {
    rows = Array.from({ length: ruleCount }, (_, index) => {
      const reference =
        retailRules[index] ?? purchaseRules[index] ?? officialRules[index] ?? {}
      const officialRule = findRule(officialRules, reference, index)
      const purchaseRule = findRule(purchaseRules, reference, index)
      const retailRule = findRule(retailRules, reference, index)
      const displayRule =
        retailRule ?? purchaseRule ?? officialRule ?? reference
      const conditions = [
        displayRule.operation && `${t('Operation')}: ${displayRule.operation}`,
        displayRule.quality && `${t('Quality')}: ${displayRule.quality}`,
        displayRule.resolution &&
          `${t('Resolution')}: ${displayRule.resolution}`,
        displayRule.with_audio === 'true' && t('With audio'),
        displayRule.with_audio === 'false' && t('Without audio'),
        displayRule.upper_bound &&
          `${t('Usage upper bound')}: ${displayRule.upper_bound}`,
      ].filter((value): value is string => Boolean(value))
      const unit = displayRule.unit ? t(displayRule.unit) : ''
      return {
        key: displayRule.id || `${displayRule.component}-${index}`,
        name: displayRule.name || `#${index + 1}`,
        label: t(
          priceComponentLabels[displayRule.component || ''] ??
            displayRule.component ??
            'Price rule'
        ),
        conditions,
        officialPrice: officialRule?.unit_price || '',
        purchasePrice: purchaseRule?.unit_price || '',
        retailPrice: retailRule?.unit_price || '',
        unit,
        unitSize: displayRule.unit_size || '1',
      }
    })
  } else {
    const officialValues = readStringRecord(
      props.officialVersion?.price_components
    )
    const purchaseValues = readSnapshotPrices(props.purchaseVersion)
    const retailValues = readSnapshotPrices(props.retail)
    const keys = [
      ...new Set([
        ...Object.keys(officialValues),
        ...Object.keys(purchaseValues),
        ...Object.keys(retailValues),
      ]),
    ].filter(
      (key) =>
        !key.startsWith('legacy_') &&
        key !== 'price_unit' &&
        key !== 'schema_version' &&
        Boolean(officialValues[key] || purchaseValues[key] || retailValues[key])
    )
    rows = keys.map((key) => ({
      key,
      name: '',
      label: t(priceComponentLabels[key] ?? key),
      conditions: [],
      officialPrice: officialValues[key] || '',
      purchasePrice: purchaseValues[key] || '',
      retailPrice: retailValues[key] || '',
      unit: '',
      unitSize: '',
    }))
  }

  return (
    <section className='space-y-2'>
      <h3 className='text-sm font-medium'>{t('Price Comparison')}</h3>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Price Components')}</TableHead>
              <TableHead>{t('Official Price')}</TableHead>
              <TableHead>{t('Purchase Price')}</TableHead>
              <TableHead>{t('Retail Price')}</TableHead>
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
                    props.officialVersion?.currency || props.retail.currency,
                    row.unit,
                    row.unitSize
                  )}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap'>
                  {formatPrice(
                    row.purchasePrice,
                    props.purchaseVersion?.currency || props.retail.currency,
                    row.unit,
                    row.unitSize
                  )}
                </TableCell>
                <TableCell className='font-mono whitespace-nowrap'>
                  {formatPrice(
                    row.retailPrice,
                    props.retail.currency,
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
