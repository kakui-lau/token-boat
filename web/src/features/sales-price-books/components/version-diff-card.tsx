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
import { useMemo, useState } from 'react'
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

import { compareSalesPriceBookVersions } from '../api'
import type { SalesPriceBookItemDiff, SalesPriceBookVersion } from '../types'

type VersionDiffCardProps = {
  baseVersion: SalesPriceBookVersion
  targetVersion: SalesPriceBookVersion
}

type ChangeTypeFilter = SalesPriceBookItemDiff['change_type'] | 'all'

function decimalPercent(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${(parsed * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

function referenceAmount(value: string, currency: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return '—'
  }
  return `${currency} ${parsed.toFixed(6).replace(/\.?0+$/, '')}`
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

function riskLabel(code: string, t: TFunction) {
  if (code === 'below_minimum_margin') {
    return t('Below minimum margin')
  }
  if (code === 'channel_below_minimum_margin') {
    return t('Below minimum margin')
  }
  if (code === 'increase_cap_exceeded') {
    return t('Increase cap exceeded')
  }
  if (code === 'missing_purchase_price') {
    return t('Missing purchase price')
  }
  if (code === 'model_removed') {
    return t('Model removed')
  }
  return code
}

export function VersionDiffCard(props: VersionDiffCardProps) {
  const { t } = useTranslation()
  const [changeType, setChangeType] = useState<ChangeTypeFilter>('all')
  const [riskOnly, setRiskOnly] = useState(false)
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
  const items = useMemo(() => {
    return (diff?.items ?? []).filter((item) => {
      if (changeType !== 'all' && item.change_type !== changeType) {
        return false
      }
      if (riskOnly && item.risk_codes.length === 0) {
        return false
      }
      return true
    })
  }, [changeType, diff?.items, riskOnly])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Version price differences')}</CardTitle>
        <CardDescription>
          {t('Compare version {{base}} with version {{target}}.', {
            base: props.baseVersion.version,
            target: props.targetVersion.version,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {diffQuery.isLoading ? <Skeleton className='h-40 w-full' /> : null}
        {diff ? (
          <>
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
            {diff.policy_changes.length > 0 ? (
              <div className='rounded-md border p-3'>
                <p className='mb-2 text-sm font-medium'>
                  {t('Policy changes')}
                </p>
                <div className='flex flex-wrap gap-2'>
                  {diff.policy_changes.map((change) => (
                    <Badge key={change.field} variant='secondary'>
                      {change.field}: {change.old_value || '—'} →{' '}
                      {change.new_value || '—'}
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
                <Table className='min-w-[108rem]'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Model Name')}</TableHead>
                      <TableHead>{t('Change type')}</TableHead>
                      <TableHead>{t('Old reference price')}</TableHead>
                      <TableHead>{t('New reference price')}</TableHead>
                      <TableHead>{t('Price change')}</TableHead>
                      <TableHead>{t('Old reference cost')}</TableHead>
                      <TableHead>{t('New reference cost')}</TableHead>
                      <TableHead>{t('Margin before')}</TableHead>
                      <TableHead>{t('Margin after')}</TableHead>
                      <TableHead>{t('Channel margins')}</TableHead>
                      <TableHead>{t('Purchase versions')}</TableHead>
                      <TableHead>{t('Risk')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.model_id}>
                        <TableCell className='font-medium'>
                          {item.model_name}
                        </TableCell>
                        <TableCell>
                          {changeTypeLabel(item.change_type, t)}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(
                            item.old_reference_price,
                            item.old_item?.currency ?? 'USD'
                          )}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(
                            item.new_reference_price,
                            item.new_item?.currency ?? 'USD'
                          )}
                        </TableCell>
                        <TableCell>
                          {decimalPercent(item.price_change_rate)}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(item.old_reference_cost, 'USD')}
                        </TableCell>
                        <TableCell>
                          {referenceAmount(item.new_reference_cost, 'USD')}
                        </TableCell>
                        <TableCell>
                          {decimalPercent(item.margin_before)}
                        </TableCell>
                        <TableCell>
                          {decimalPercent(item.margin_after)}
                        </TableCell>
                        <TableCell className='max-w-96 whitespace-normal'>
                          {item.new_channel_margins.length > 0
                            ? item.new_channel_margins
                                .map(
                                  (margin) =>
                                    `${margin.channel_name}: ${decimalPercent(margin.margin_rate)}`
                                )
                                .join(' | ')
                            : '—'}
                        </TableCell>
                        <TableCell className='max-w-72 whitespace-normal'>
                          {item.old_purchase_version_ids.join(', ') || '—'} →{' '}
                          {item.new_purchase_version_ids.join(', ') || '—'}
                        </TableCell>
                        <TableCell className='max-w-80 whitespace-normal'>
                          {item.risk_codes.length > 0
                            ? item.risk_codes
                                .map((code) => riskLabel(code, t))
                                .join(', ')
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
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
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
