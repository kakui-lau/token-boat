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
import type { TFunction } from 'i18next'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
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
import { cn } from '@/lib/utils'

import { compareSalesPriceBookVersions } from '../api'
import { pricingRiskLabel } from '../lib/pricing-risk'
import type { SalesPriceBookItemDiff, SalesPriceBookVersion } from '../types'
import { ListPagination } from './list-pagination'
import { TableRecordCount } from './table-record-count'

type VersionDiffCardProps = {
  baseVersion: SalesPriceBookVersion
  targetVersion: SalesPriceBookVersion
}

type ChangeTypeFilter = SalesPriceBookItemDiff['change_type'] | 'all'

const emptyDiffItems: SalesPriceBookItemDiff[] = []

function decimalPercent(value: string) {
  if (!value.trim()) {
    return '—'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${(parsed * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

function referenceAmount(value: string, currency: string) {
  if (!value.trim()) {
    return '—'
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${currency} ${parsed.toFixed(6).replace(/\.?0+$/, '')}`
}

function decimalValuesDiffer(oldValue: string, newValue: string) {
  const oldNumber = Number(oldValue)
  const newNumber = Number(newValue)
  if (Number.isFinite(oldNumber) && Number.isFinite(newNumber)) {
    return oldNumber !== newNumber
  }
  return oldValue.trim() !== newValue.trim()
}

function channelMarginsDiffer(
  oldMargins: SalesPriceBookItemDiff['old_channel_margins'],
  newMargins: SalesPriceBookItemDiff['new_channel_margins']
) {
  const oldList = oldMargins ?? []
  const newList = newMargins ?? []
  if (oldList.length !== newList.length) {
    return true
  }
  return oldList.some((oldMargin, index) => {
    const newMargin = newList[index]
    return (
      !newMargin ||
      oldMargin.channel_model_id !== newMargin.channel_model_id ||
      oldMargin.purchase_price_version_id !==
        newMargin.purchase_price_version_id ||
      decimalValuesDiffer(oldMargin.reference_cost, newMargin.reference_cost) ||
      decimalValuesDiffer(oldMargin.margin_rate, newMargin.margin_rate) ||
      oldMargin.meets_minimum_margin !== newMargin.meets_minimum_margin
    )
  })
}

function purchaseSourceDiff(item: SalesPriceBookItemDiff) {
  const channelNameByVersionId = new Map<number, string>()
  const margins = [
    ...(item.old_channel_margins ?? []),
    ...(item.new_channel_margins ?? []),
  ]
  for (const margin of margins) {
    if (margin.purchase_price_version_id <= 0) continue
    const channelName = margin.channel_name.trim()
    if (channelName) {
      channelNameByVersionId.set(margin.purchase_price_version_id, channelName)
    }
  }
  const oldVersionIds = item.old_purchase_version_ids ?? []
  const newVersionIds = item.new_purchase_version_ids ?? []
  const oldVersionIdSet = new Set(oldVersionIds)
  const newVersionIdSet = new Set(newVersionIds)
  const label = (versionId: number) => {
    const channelName = channelNameByVersionId.get(versionId)
    return channelName ? `${channelName} (#${versionId})` : `#${versionId}`
  }
  return {
    oldSources: oldVersionIds.map(label),
    newSources: newVersionIds.map(label),
    removedSources: oldVersionIds
      .filter((versionId) => !newVersionIdSet.has(versionId))
      .map(label),
    addedSources: newVersionIds
      .filter((versionId) => !oldVersionIdSet.has(versionId))
      .map(label),
  }
}

type VersionValueComparisonProps = {
  oldValue: string
  newValue: string
  changeType: SalesPriceBookItemDiff['change_type']
  changed: boolean
  changeValue?: string
}

function VersionValueComparison(props: VersionValueComparisonProps) {
  const isAdded = props.changeType === 'added'
  const isChanged = props.changeType === 'changed'
  const isRemoved = props.changeType === 'removed'
  return (
    <div className='flex flex-col items-start gap-1.5'>
      <div className='flex items-center gap-1.5 whitespace-nowrap'>
        <span>{props.oldValue}</span>
        <span className='text-muted-foreground'>→</span>
        <span
          className={cn(
            isAdded && 'bg-success/10 rounded px-1.5 py-0.5 font-medium',
            isChanged &&
              props.changed &&
              'bg-warning/10 rounded px-1.5 py-0.5 font-medium',
            isRemoved && 'text-muted-foreground'
          )}
        >
          {props.newValue}
        </span>
      </div>
      {props.changeValue ? (
        <Badge variant='warning'>{props.changeValue}</Badge>
      ) : null}
    </div>
  )
}

function channelMarginSummary(
  margins: SalesPriceBookItemDiff['new_channel_margins']
) {
  const values = (margins ?? []).map(
    (margin) => `${margin.channel_name}: ${decimalPercent(margin.margin_rate)}`
  )
  return values.length > 0 ? values.join(' | ') : '—'
}

function changeTypeLabel(
  type: SalesPriceBookItemDiff['change_type'],
  t: TFunction
) {
  if (type === 'added') {
    return t('Added')
  }
  if (type === 'removed') {
    return t('Removed')
  }
  if (type === 'changed') {
    return t('Changed')
  }
  return t('Unchanged')
}

function policyFieldLabel(field: string, t: TFunction) {
  const labels: Record<string, string> = {
    cost_basis_strategy: t('Cost basis'),
    payment_fee_rate: t('Payment processing fee'),
    distribution_fee_rate: t('Distribution fee'),
    operations_labor_rate: t('Operations labor cost'),
    total_variable_cost_rate: t('Variable cost rate'),
    effective_tax_rate: t('Tax rate'),
    target_net_margin: t('Target margin'),
    minimum_margin_rate: t('Minimum margin rate'),
    increase_cap_rate: t('Price increase cap'),
  }
  return labels[field] ?? field
}

function policyValue(field: string, value: string, t: TFunction) {
  if (field === 'cost_basis_strategy') {
    if (value === 'min_eligible_cost') {
      return t('Minimum eligible purchase cost')
    }
    if (value === 'max_eligible_cost') {
      return t('Maximum eligible purchase cost')
    }
    if (value === 'designated_channel') {
      return t('Designated channel')
    }
    return value || '—'
  }
  if (field.endsWith('_rate')) {
    return decimalPercent(value)
  }
  return value || '—'
}

export function VersionDiffCard(props: VersionDiffCardProps) {
  const { t } = useTranslation()
  const [changeType, setChangeType] = useState<ChangeTypeFilter>('all')
  const [riskOnly, setRiskOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const diffQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'version-diff',
      props.baseVersion.id,
      props.targetVersion.id,
    ],
    queryFn: () =>
      compareSalesPriceBookVersions(
        props.baseVersion.id,
        props.targetVersion.id
      ),
  })
  const diff = diffQuery.data?.data
  const policyChanges = diff?.policy_changes ?? []
  const diffItems = diff?.items ?? emptyDiffItems
  const targetHasNoPrices =
    diffItems.length > 0 &&
    diffItems.every((item) => !item.new_item) &&
    diff?.removed_count === diffItems.length
  const items = useMemo(
    () =>
      diffItems
        .filter((item) => {
          if (changeType !== 'all' && item.change_type !== changeType) {
            return false
          }
          if (riskOnly && (item.risk_codes ?? []).length === 0) {
            return false
          }
          return true
        })
        .sort((left, right) => {
          const leftRequiresReview = (left.risk_codes ?? []).length > 0
          const rightRequiresReview = (right.risk_codes ?? []).length > 0
          return Number(leftRequiresReview) - Number(rightRequiresReview)
        }),
    [changeType, diffItems, riskOnly]
  )
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const visiblePage = Math.min(page, pageCount)
  const pagedItems = items.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize
  )
  useEffect(() => {
    setPage(1)
  }, [changeType, props.baseVersion.id, props.targetVersion.id, riskOnly])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Version price differences')}</CardTitle>
        <CardDescription>
          {t('Comparing v{{base}} (old) → v{{target}} (new).', {
            base: props.baseVersion.version,
            target: props.targetVersion.version,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {diffQuery.isLoading ? <Skeleton className='h-40 w-full' /> : null}
        {diff ? (
          <>
            {targetHasNoPrices ? (
              <div
                role='status'
                className='border-warning/40 bg-warning/10 text-warning rounded-lg border p-4 text-sm'
              >
                {t(
                  'Version v{{target}} has no model prices, so all {{count}} models from v{{base}} are shown as removed. Generate prices for v{{target}} first.',
                  {
                    base: props.baseVersion.version,
                    target: props.targetVersion.version,
                    count: diff.removed_count,
                  }
                )}
              </div>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>
                {t('Added')}: {diff.added_count}
              </Badge>
              <Badge variant='outline'>
                {t('Changed')}: {diff.changed_count}
              </Badge>
              <Badge variant='outline'>
                {t('Removed')}: {diff.removed_count}
              </Badge>
              <Badge variant='outline'>
                {t('Unchanged')}: {diff.unchanged_count}
              </Badge>
              <Badge variant={diff.review_count > 0 ? 'warning' : 'outline'}>
                {t('Requires review')}: {diff.review_count}
              </Badge>
            </div>
            {policyChanges.length > 0 ? (
              <div className='rounded-md border p-3'>
                <p className='mb-2 text-sm font-medium'>
                  {t('Policy changes')}
                </p>
                <div className='flex flex-wrap gap-2'>
                  {policyChanges.map((change) => (
                    <Badge key={change.field} variant='warning'>
                      {policyFieldLabel(change.field, t)}:{' '}
                      {policyValue(change.field, change.old_value, t)} →{' '}
                      {policyValue(change.field, change.new_value, t)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div className='flex flex-wrap items-center gap-4'>
              <NativeSelect
                className='w-44'
                aria-label={t('Change type')}
                value={changeType}
                onChange={(event) =>
                  setChangeType(event.target.value as ChangeTypeFilter)
                }
              >
                <NativeSelectOption value='all'>
                  {t('All changes')}
                </NativeSelectOption>
                <NativeSelectOption value='added'>
                  {t('Added')}
                </NativeSelectOption>
                <NativeSelectOption value='changed'>
                  {t('Changed')}
                </NativeSelectOption>
                <NativeSelectOption value='removed'>
                  {t('Removed')}
                </NativeSelectOption>
                <NativeSelectOption value='unchanged'>
                  {t('Unchanged')}
                </NativeSelectOption>
              </NativeSelect>
              <label className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={riskOnly}
                  onCheckedChange={(checked) => setRiskOnly(checked === true)}
                />
                {t('Only items requiring review')}
              </label>
            </div>
            {items.length > 0 ? (
              <div className='overflow-x-auto'>
                <Table className='min-w-[92rem]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='bg-card sticky left-0 z-10'>
                        {t('Model Name')}
                      </TableHead>
                      <TableHead>{t('Change type')}</TableHead>
                      <TableHead
                        aria-label={`${t('Sales reference price')} ${t('Current active version')} → ${t('Edited version')}`}
                      >
                        <span className='block'>
                          {t('Sales reference price')}
                        </span>
                        <span className='text-muted-foreground block text-xs font-normal'>
                          {t('Current active version')} → {t('Edited version')}
                        </span>
                      </TableHead>
                      <TableHead
                        aria-label={`${t('Purchase reference cost')} ${t('Current active version')} → ${t('Edited version')}`}
                      >
                        <span className='block'>
                          {t('Purchase reference cost')}
                        </span>
                        <span className='text-muted-foreground block text-xs font-normal'>
                          {t('Current active version')} → {t('Edited version')}
                        </span>
                      </TableHead>
                      <TableHead
                        aria-label={`${t('Net margin rate')} ${t('Current active version')} → ${t('Edited version')}`}
                      >
                        <span className='block'>{t('Net margin rate')}</span>
                        <span className='text-muted-foreground block text-xs font-normal'>
                          {t('Current active version')} → {t('Edited version')}
                        </span>
                      </TableHead>
                      <TableHead
                        aria-label={`${t('Channel margins')} ${t('Current active version')} → ${t('Edited version')}`}
                      >
                        <span className='block'>{t('Channel margins')}</span>
                        <span className='text-muted-foreground block text-xs font-normal'>
                          {t('Current active version')} → {t('Edited version')}
                        </span>
                      </TableHead>
                      <TableHead>{t('Purchase price sources')}</TableHead>
                      <TableHead>{t('Risk')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedItems.map((item) => {
                      const isAdded = item.change_type === 'added'
                      const isChanged = item.change_type === 'changed'
                      const isRemoved = item.change_type === 'removed'
                      const priceChanged = decimalValuesDiffer(
                        item.old_reference_price,
                        item.new_reference_price
                      )
                      const priceRateChanged = decimalValuesDiffer(
                        '0',
                        item.price_change_rate
                      )
                      const costChanged = decimalValuesDiffer(
                        item.old_reference_cost,
                        item.new_reference_cost
                      )
                      const marginChanged = decimalValuesDiffer(
                        item.margin_before,
                        item.margin_after
                      )
                      const purchaseSources = purchaseSourceDiff(item)
                      const marginsChanged = channelMarginsDiffer(
                        item.old_channel_margins,
                        item.new_channel_margins
                      )
                      let changeBadgeVariant:
                        | 'outline'
                        | 'warning'
                        | 'destructive' = 'outline'
                      if (isChanged) changeBadgeVariant = 'warning'
                      if (isRemoved) changeBadgeVariant = 'destructive'
                      return (
                        <TableRow key={item.model_id}>
                          <TableCell className='bg-card sticky left-0 z-10 font-medium'>
                            {item.model_name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={changeBadgeVariant}
                              className={cn(
                                isAdded &&
                                  'border-success/40 bg-success/10 text-success'
                              )}
                            >
                              {changeTypeLabel(item.change_type, t)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <VersionValueComparison
                              oldValue={referenceAmount(
                                item.old_reference_price,
                                item.old_item?.currency ?? 'USD'
                              )}
                              newValue={referenceAmount(
                                item.new_reference_price,
                                item.new_item?.currency ?? 'USD'
                              )}
                              changeType={item.change_type}
                              changed={priceChanged}
                              changeValue={
                                priceRateChanged
                                  ? decimalPercent(item.price_change_rate)
                                  : undefined
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <VersionValueComparison
                              oldValue={referenceAmount(
                                item.old_reference_cost,
                                'USD'
                              )}
                              newValue={referenceAmount(
                                item.new_reference_cost,
                                'USD'
                              )}
                              changeType={item.change_type}
                              changed={costChanged}
                            />
                          </TableCell>
                          <TableCell>
                            <VersionValueComparison
                              oldValue={decimalPercent(item.margin_before)}
                              newValue={decimalPercent(item.margin_after)}
                              changeType={item.change_type}
                              changed={marginChanged}
                            />
                          </TableCell>
                          <TableCell className='max-w-96 whitespace-normal'>
                            <VersionValueComparison
                              oldValue={channelMarginSummary(
                                item.old_channel_margins
                              )}
                              newValue={channelMarginSummary(
                                item.new_channel_margins
                              )}
                              changeType={item.change_type}
                              changed={marginsChanged}
                            />
                          </TableCell>
                          <TableCell className='max-w-96 min-w-80 whitespace-normal'>
                            <div className='flex flex-col gap-1.5'>
                              <div className='flex items-start gap-2'>
                                <span className='text-muted-foreground w-20 shrink-0 text-xs font-normal'>
                                  {t('Current active version')}
                                </span>
                                <div className='flex flex-wrap gap-1'>
                                  {purchaseSources.oldSources.length > 0 ? (
                                    purchaseSources.oldSources.map((source) => (
                                      <Badge key={source} variant='outline'>
                                        {source}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className='text-muted-foreground font-normal'>
                                      {t('None')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className='flex items-start gap-2'>
                                <span className='text-muted-foreground w-20 shrink-0 text-xs font-normal'>
                                  {t('Edited version')}
                                </span>
                                <div className='flex flex-wrap gap-1'>
                                  {purchaseSources.newSources.length > 0 ? (
                                    purchaseSources.newSources.map((source) => (
                                      <Badge key={source} variant='outline'>
                                        {source}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className='text-muted-foreground font-normal'>
                                      {t('None')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className='flex flex-wrap gap-1'>
                                {purchaseSources.removedSources.length > 0 ? (
                                  <Badge
                                    variant='destructive'
                                    className='h-auto whitespace-normal'
                                  >
                                    {t('Removed source: {{sources}}', {
                                      sources:
                                        purchaseSources.removedSources.join(
                                          ', '
                                        ),
                                    })}
                                  </Badge>
                                ) : null}
                                {purchaseSources.addedSources.length > 0 ? (
                                  <Badge
                                    variant='outline'
                                    className='border-success/40 bg-success/10 text-success h-auto whitespace-normal'
                                  >
                                    {t('Added source: {{sources}}', {
                                      sources:
                                        purchaseSources.addedSources.join(', '),
                                    })}
                                  </Badge>
                                ) : null}
                              </div>
                              {isRemoved ? (
                                <p className='text-muted-foreground text-xs font-normal'>
                                  {t(
                                    'Model is not included in the edited version.'
                                  )}
                                </p>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className='max-w-80 whitespace-normal'>
                            {(item.risk_codes ?? []).length > 0 ? (
                              <div className='flex flex-wrap gap-1'>
                                {(item.risk_codes ?? []).map((code) => (
                                  <Badge
                                    key={code}
                                    variant='destructive'
                                    className='h-auto whitespace-normal'
                                  >
                                    {pricingRiskLabel(code, t)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className='text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Empty className='min-h-32'>
                <EmptyHeader>
                  <EmptyTitle>
                    {t('No version differences match the filters')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t('Adjust the change or risk filters.')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <div className='flex flex-col gap-2'>
              <TableRecordCount total={items.length} />
              <ListPagination
                page={visiblePage}
                pageSize={pageSize}
                total={items.length}
                isFetching={diffQuery.isFetching}
                onPageChange={setPage}
                onPageSizeChange={(value) => {
                  setPageSize(value)
                  setPage(1)
                }}
              />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
