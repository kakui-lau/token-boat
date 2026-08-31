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
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Download01Icon,
  InformationCircleIcon,
  Delete02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Fragment, useDeferredValue, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { formatPurchaseDiscount } from '../../pricing-admin/lib/purchase-discount'
import { pricingRiskLabel } from '../lib/pricing-risk'
import type {
  SalesPriceBookChannelMargin,
  SalesPriceBookChannelMarginOverrideField,
  SalesPriceBookItem,
  SalesPriceBookVersion,
} from '../types'
import { ChannelModelOverrideDialog } from './channel-model-override-dialog'
import { ListPagination } from './list-pagination'
import { SalesPriceDetailsDialog } from './sales-price-details-dialog'
import { TableRecordCount } from './table-record-count'

type ModelPriceTableProps = {
  version: SalesPriceBookVersion
  items: SalesPriceBookItem[]
  isLoading: boolean
  canExport: boolean
  canWrite?: boolean
  canPublish?: boolean
  isExporting: boolean
  isExportingChannelModels?: boolean
  isDeleting: boolean
  isUpdatingStatus: boolean
  onExport: () => void
  onExportChannelModels?: () => void
  onEdit: (item: SalesPriceBookItem) => void
  onDelete: (itemIds: number | number[]) => Promise<unknown>
  onReview: (item: SalesPriceBookItem, action: 'accept' | 'reject') => void
  onRegenerate: (item: SalesPriceBookItem) => void
  onSetEnabled: (itemId: number, enabled: boolean) => void
}

function formatSellingFactor(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return parsed.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

function formatMarginRate(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return `${(parsed * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`
}

function formatAboveOfficialPriceWarning(
  value: string,
  t: (key: string, values?: Record<string, string>) => string
) {
  const multiplier = Number(value)
  if (!Number.isFinite(multiplier) || multiplier <= 1) {
    return t('Sales price is above official price')
  }
  const discount = (multiplier * 10)
    .toFixed(4)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
  const percent = ((multiplier - 1) * 100)
    .toFixed(4)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
  return t(
    'Sales discount: {{discount}}/10; {{percent}}% above official price.',
    { discount, percent }
  )
}

function itemStatusLabel(
  status: SalesPriceBookItem['status'],
  t: (key: string) => string
) {
  if (status === 'enabled') return t('Enabled')
  if (status === 'disabled') return t('Disabled')
  return t('Requires review')
}

const channelPolicyFieldLabels: Record<
  SalesPriceBookChannelMarginOverrideField,
  string
> = {
  payment_fee_rate: 'Payment processing fee',
  distribution_fee_rate: 'Distribution fee',
  operations_labor_rate: 'Operations labor cost',
  effective_tax_rate: 'Tax rate',
  target_net_margin: 'Target margin',
  minimum_margin_rate: 'Minimum margin rate',
}

export function ModelPriceTable(props: ModelPriceTableProps) {
  const { t } = useTranslation()
  const canWrite = props.canWrite ?? true
  const canPublish = props.canPublish ?? true
  const [keyword, setKeyword] = useState('')
  const [formulaItem, setFormulaItem] = useState<SalesPriceBookItem>()
  const [priceDetailsItem, setPriceDetailsItem] = useState<SalesPriceBookItem>()
  const [overrideTarget, setOverrideTarget] = useState<{
    item: SalesPriceBookItem
    channel: SalesPriceBookChannelMargin
  }>()
  const [deleteItems, setDeleteItems] = useState<SalesPriceBookItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase())
  const filteredItems = deferredKeyword
    ? props.items.filter((item) =>
        item.model_name.toLowerCase().includes(deferredKeyword)
      )
    : props.items
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const visiblePage = Math.min(page, pageCount)
  const pagedItems = filteredItems.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize
  )
  const selectableItems =
    props.version.status === 'draft' && canWrite ? pagedItems : []
  const selectedOnPage = selectableItems.filter((item) =>
    selectedIds.has(item.id)
  ).length
  const allOnPageSelected =
    selectableItems.length > 0 && selectedOnPage === selectableItems.length
  useEffect(() => {
    setSelectedIds(new Set())
    setExpandedIds(new Set())
    setPage(1)
  }, [props.version.id])
  const isActive = props.version.status === 'active'
  const reviewItems = props.items.filter(
    (item) => item.status === 'review_required'
  )
  const reviewReasons = [
    ...new Set(
      reviewItems.map((item) =>
        pricingRiskLabel(item.review_risk_code ?? '', t)
      )
    ),
  ]

  return (
    <>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center gap-2'>
            <CardTitle>{t('3. Review model sales prices')}</CardTitle>
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive
                ? t('Currently billed: v{{version}}', {
                    version: props.version.version,
                  })
                : t('Viewing draft: v{{version}}', {
                    version: props.version.version,
                  })}
            </Badge>
          </div>
          <CardDescription>
            {isActive
              ? t('Customers are currently billed with these model prices.')
              : t(
                  'These prices do not affect customers until this draft is published.'
                )}
          </CardDescription>
          {props.canExport ? (
            <CardAction>
              <div className='flex flex-wrap justify-end gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={props.isExporting}
                  onClick={props.onExport}
                >
                  <HugeiconsIcon
                    icon={Download01Icon}
                    data-icon='inline-start'
                  />
                  {t('Export model pricing')}
                </Button>
                {props.onExportChannelModels ? (
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={props.isExportingChannelModels}
                    onClick={props.onExportChannelModels}
                  >
                    <HugeiconsIcon
                      icon={Download01Icon}
                      data-icon='inline-start'
                    />
                    {t('Export channel model pricing')}
                  </Button>
                ) : null}
              </div>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {reviewItems.length > 0 ? (
            <Alert variant='destructive'>
              <AlertTitle>
                {t('{{count}} model prices require review', {
                  count: reviewItems.length,
                })}
              </AlertTitle>
              <AlertDescription>{reviewReasons.join('；')}</AlertDescription>
            </Alert>
          ) : null}
          <Input
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value)
              setPage(1)
            }}
            placeholder={t('Search model prices')}
            aria-label={t('Search model prices')}
          />
          {props.version.status === 'draft' && canWrite ? (
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='text-muted-foreground text-sm'>
                {t('{{count}} selected', { count: selectedIds.size })}
              </p>
              <Button
                size='sm'
                variant='destructive'
                disabled={selectedIds.size === 0 || props.isDeleting}
                onClick={() =>
                  setDeleteItems(
                    props.items.filter((item) => selectedIds.has(item.id))
                  )
                }
              >
                <HugeiconsIcon icon={Delete02Icon} data-icon='inline-start' />
                {t('Delete selected')}
              </Button>
            </div>
          ) : null}
          {props.isLoading ? <Skeleton className='h-32 w-full' /> : null}
          {!props.isLoading && props.items.length === 0 ? (
            <Empty className='min-h-32'>
              <EmptyHeader>
                <EmptyTitle>{t('No model prices in this version')}</EmptyTitle>
                <EmptyDescription>
                  {t(
                    'Generate prices from selected channel models before publishing.'
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {!props.isLoading &&
          props.items.length > 0 &&
          filteredItems.length === 0 ? (
            <Empty className='min-h-32'>
              <EmptyHeader>
                <EmptyTitle>{t('No model prices match the search')}</EmptyTitle>
                <EmptyDescription>
                  {t('Try a different model name.')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
          {pagedItems.length > 0 ? (
            <Table className='min-w-[76rem]'>
              <TableHeader>
                <TableRow>
                  {props.version.status === 'draft' && canWrite ? (
                    <TableHead className='w-12'>
                      <Checkbox
                        checked={allOnPageSelected}
                        indeterminate={selectedOnPage > 0 && !allOnPageSelected}
                        aria-label={t('Select current page')}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          for (const item of selectableItems) {
                            if (checked) next.add(item.id)
                            else next.delete(item.id)
                          }
                          setSelectedIds(next)
                        }}
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className='bg-card sticky left-0 z-10'>
                    {t('Model Name')}
                  </TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Billing mode')}</TableHead>
                  <TableHead>{t('Customer price rule')}</TableHead>
                  <TableHead>{t('Sales discount')}</TableHead>
                  <TableHead>{t('Pricing details')}</TableHead>
                  <TableHead>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((item) => {
                  const factor = formatSellingFactor(item.selling_factor)
                  const hasSharedFactor = Number(item.selling_factor) > 0
                  const channelMargins = item.channel_margins ?? []
                  const isExpanded = expandedIds.has(item.id)
                  const detailId = `channel-costs-${item.id}`
                  let costBasisStrategy = props.version.cost_basis_strategy
                  let customerPriceRule = t('Custom billing expression')
                  if (item.pricing_method === 'cost_plus') {
                    customerPriceRule = hasSharedFactor
                      ? t('Purchase cost × {{factor}}', { factor })
                      : t('Generated from channel-specific costs')
                  }
                  if (costBasisStrategy === 'max_eligible_cost') {
                    costBasisStrategy = t(
                      'Price using the highest eligible channel cost'
                    )
                  } else if (costBasisStrategy === 'min_eligible_cost') {
                    costBasisStrategy = t(
                      'Price using the lowest eligible channel cost'
                    )
                  } else if (costBasisStrategy === 'designated_channel') {
                    costBasisStrategy = t('Designated channel')
                  }
                  let actionContent
                  if (props.version.status === 'draft' && canWrite) {
                    let statusActions = null
                    if (item.status === 'review_required') {
                      if (
                        item.review_risk_code === 'channel_model_policy_changed'
                      ) {
                        statusActions = (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => props.onRegenerate(item)}
                          >
                            {t('Regenerate')}
                          </Button>
                        )
                      } else if (canPublish) {
                        statusActions = (
                          <>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => props.onReview(item, 'accept')}
                            >
                              {t('Accept risk')}
                            </Button>
                            <Button
                              size='sm'
                              variant='destructive'
                              onClick={() => props.onReview(item, 'reject')}
                            >
                              {t('Reject')}
                            </Button>
                          </>
                        )
                      }
                    } else {
                      statusActions = (
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={props.isUpdatingStatus}
                          onClick={() =>
                            props.onSetEnabled(
                              item.id,
                              item.status !== 'enabled'
                            )
                          }
                        >
                          {item.status === 'enabled'
                            ? t('Disable')
                            : t('Enable')}
                        </Button>
                      )
                    }
                    actionContent = (
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => props.onEdit(item)}
                        >
                          {t('Edit')}
                        </Button>
                        {statusActions}
                        <Button
                          size='sm'
                          variant='destructive'
                          disabled={props.isDeleting}
                          onClick={() => setDeleteItems([item])}
                        >
                          <HugeiconsIcon
                            icon={Delete02Icon}
                            data-icon='inline-start'
                          />
                          {t('Delete')}
                        </Button>
                      </div>
                    )
                  } else if (props.version.status === 'draft') {
                    actionContent = (
                      <span className='text-muted-foreground text-sm'>
                        {t('You have read-only access')}
                      </span>
                    )
                  } else {
                    actionContent = (
                      <span className='text-muted-foreground text-sm'>
                        {t('Published versions are read-only')}
                      </span>
                    )
                  }

                  return (
                    <Fragment key={item.id}>
                      <TableRow>
                        {props.version.status === 'draft' && canWrite ? (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(item.id)}
                              aria-label={t('Select {{model}}', {
                                model: item.model_name,
                              })}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedIds)
                                if (checked) next.add(item.id)
                                else next.delete(item.id)
                                setSelectedIds(next)
                              }}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className='bg-card sticky left-0 z-10 font-medium'>
                          <div className='flex min-w-56 flex-col items-start gap-1'>
                            <span>{item.model_name}</span>
                            {channelMargins.length > 0 ? (
                              <Button
                                size='sm'
                                variant='ghost'
                                className='text-muted-foreground h-auto px-0 py-1 font-normal'
                                aria-expanded={isExpanded}
                                aria-controls={detailId}
                                onClick={() => {
                                  const next = new Set(expandedIds)
                                  if (isExpanded) next.delete(item.id)
                                  else next.add(item.id)
                                  setExpandedIds(next)
                                }}
                              >
                                <HugeiconsIcon
                                  icon={
                                    isExpanded
                                      ? ArrowDown01Icon
                                      : ArrowRight01Icon
                                  }
                                  data-icon='inline-start'
                                  aria-hidden='true'
                                />
                                {t('{{count}} channel costs', {
                                  count: channelMargins.length,
                                })}
                              </Button>
                            ) : (
                              <span className='text-muted-foreground text-xs font-normal'>
                                {t('No channel cost details')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex max-w-72 flex-col items-start gap-1.5 whitespace-normal'>
                            <Badge
                              variant={
                                item.status === 'review_required'
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {itemStatusLabel(item.status, t)}
                            </Badge>
                            {item.status === 'review_required' ? (
                              <div className='text-xs'>
                                <p className='font-medium'>
                                  {t('Review reason')}
                                </p>
                                <p className='text-destructive'>
                                  {pricingRiskLabel(
                                    item.review_risk_code ?? '',
                                    t
                                  )}
                                </p>
                                {item.review_reason ? (
                                  <p className='text-muted-foreground mt-1'>
                                    {item.review_reason}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {item.warning_code === 'above_official_price' ? (
                              <div className='flex flex-col items-start gap-1 text-xs'>
                                <Badge
                                  variant='outline'
                                  className='border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                >
                                  {t('Sales price is above official price')}
                                </Badge>
                                <p className='text-amber-700 dark:text-amber-300'>
                                  {formatAboveOfficialPriceWarning(
                                    item.warning_sales_discount ?? '',
                                    t
                                  )}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.billing_mode === 'token'
                            ? t('Token usage')
                            : item.billing_mode}
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-col gap-1'>
                            <span className='font-medium'>
                              {customerPriceRule}
                            </span>
                            <span className='text-muted-foreground text-xs'>
                              {item.pricing_method === 'cost_plus'
                                ? t(
                                    'Purchase cost plus operating costs and margin'
                                  )
                                : item.pricing_method}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          {formatPurchaseDiscount(item.sales_discount ?? '', t)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => setFormulaItem(item)}
                          >
                            <HugeiconsIcon
                              icon={InformationCircleIcon}
                              data-icon='inline-start'
                            />
                            {t('View formula')}
                          </Button>
                        </TableCell>
                        <TableCell>{actionContent}</TableCell>
                      </TableRow>
                      {isExpanded ? (
                        <TableRow className='hover:bg-transparent'>
                          <TableCell
                            colSpan={
                              props.version.status === 'draft' && canWrite
                                ? 8
                                : 7
                            }
                            className='bg-muted/20 p-0 whitespace-normal'
                          >
                            <section
                              id={detailId}
                              aria-label={t(
                                'Channel costs and margins for {{model}}',
                                {
                                  model: item.model_name,
                                }
                              )}
                              className='flex flex-col gap-3 p-4'
                            >
                              <div>
                                <h4 className='font-medium'>
                                  {t('Channel costs and margins')}
                                </h4>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                  {t(
                                    'The logical model uses one customer sales price across all channels. Channel purchase costs and margins may differ.'
                                  )}
                                </p>
                              </div>
                              <dl className='grid gap-2 md:max-w-md'>
                                <div className='bg-background rounded-md border p-3'>
                                  <dt className='text-muted-foreground text-xs'>
                                    {t('Unified sales price strategy')}
                                  </dt>
                                  <dd className='mt-1 font-medium'>
                                    {costBasisStrategy || '—'}
                                  </dd>
                                </div>
                              </dl>
                              <div>
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => setPriceDetailsItem(item)}
                                >
                                  {t('View sales price details')}
                                </Button>
                              </div>
                              <Table className='min-w-[64rem]'>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>{t('Channel')}</TableHead>
                                    <TableHead>
                                      {t('Purchase Discount')}
                                    </TableHead>
                                    <TableHead>{t('Sales discount')}</TableHead>
                                    <TableHead>
                                      {t('Effective parameters')}
                                    </TableHead>
                                    <TableHead>
                                      {t('Routing by price')}
                                    </TableHead>
                                    <TableHead>{t('Cost role')}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {channelMargins.map((channel) => {
                                    const overriddenFields =
                                      channel.overridden_fields ?? []
                                    return (
                                      <TableRow
                                        key={`${channel.channel_model_id}-${channel.purchase_price_version_id}`}
                                      >
                                        <TableCell>
                                          <div className='flex flex-col gap-0.5'>
                                            <span className='font-medium'>
                                              {channel.channel_name}
                                            </span>
                                            <span className='text-muted-foreground text-xs'>
                                              {t('Channel model #{{id}}', {
                                                id: channel.channel_model_id,
                                              })}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {channel.purchase_pricing_mode ===
                                          'official_ratio'
                                            ? formatPurchaseDiscount(
                                                channel.purchase_discount,
                                                t
                                              )
                                            : t('Not applicable')}
                                        </TableCell>
                                        <TableCell className='whitespace-nowrap'>
                                          {channel.sales_discount
                                            ? formatPurchaseDiscount(
                                                channel.sales_discount,
                                                t
                                              )
                                            : '—'}
                                        </TableCell>
                                        <TableCell>
                                          <div className='flex min-w-52 flex-col gap-1 text-xs'>
                                            <div className='flex items-center gap-2'>
                                              <span>
                                                VCR{' '}
                                                {formatMarginRate(
                                                  channel.total_variable_cost_rate
                                                )}{' '}
                                                · TR{' '}
                                                {formatMarginRate(
                                                  channel.effective_tax_rate
                                                )}{' '}
                                                · TM{' '}
                                                {formatMarginRate(
                                                  channel.target_net_margin
                                                )}
                                              </span>
                                              {overriddenFields.length > 0 ? (
                                                <Badge variant='secondary'>
                                                  {t('{{count}} override', {
                                                    count:
                                                      overriddenFields.length,
                                                  })}
                                                </Badge>
                                              ) : (
                                                <Badge variant='outline'>
                                                  {t('Version default')}
                                                </Badge>
                                              )}
                                            </div>
                                            {overriddenFields.length > 0 ? (
                                              <div className='flex flex-wrap items-center gap-1'>
                                                <span className='text-muted-foreground'>
                                                  {t('Override')}:
                                                </span>
                                                {overriddenFields.map(
                                                  (field) => (
                                                    <Badge
                                                      key={field}
                                                      variant='outline'
                                                    >
                                                      {t(
                                                        channelPolicyFieldLabels[
                                                          field
                                                        ]
                                                      )}{' '}
                                                      {formatMarginRate(
                                                        props.version[field]
                                                      )}{' '}
                                                      →{' '}
                                                      {formatMarginRate(
                                                        channel[field]
                                                      )}
                                                    </Badge>
                                                  )
                                                )}
                                              </div>
                                            ) : null}
                                            {props.version.status === 'draft' &&
                                            canWrite ? (
                                              <Button
                                                size='sm'
                                                variant='outline'
                                                className='w-fit'
                                                onClick={() =>
                                                  setOverrideTarget({
                                                    item,
                                                    channel,
                                                  })
                                                }
                                              >
                                                {t('Set special parameters')}
                                              </Button>
                                            ) : null}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge
                                            variant={
                                              channel.meets_minimum_margin
                                                ? 'outline'
                                                : 'destructive'
                                            }
                                          >
                                            {channel.meets_minimum_margin
                                              ? t('Margin allows routing')
                                              : t('Margin blocks routing')}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          {channel.source_role === 'candidate'
                                            ? t('Comparison only')
                                            : t(
                                                'Included in unified sales price basis'
                                              )}
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                              <p className='text-muted-foreground text-xs'>
                                {t(
                                  'This status checks pricing and minimum margin only. Actual routing also depends on channel availability, user group, and circuit breaker status.'
                                )}
                              </p>
                            </section>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          ) : null}
          {!props.isLoading ? (
            <div className='flex flex-col gap-2'>
              <TableRecordCount total={filteredItems.length} />
              <ListPagination
                page={visiblePage}
                pageSize={pageSize}
                total={filteredItems.length}
                isFetching={false}
                onPageChange={setPage}
                onPageSizeChange={(value) => {
                  setPageSize(value)
                  setPage(1)
                }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(formulaItem)}
        onOpenChange={(open) => {
          if (!open) setFormulaItem(undefined)
        }}
      >
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>
              {t('Pricing formula for {{model}}', {
                model: formulaItem?.model_name ?? '',
              })}
            </DialogTitle>
            <DialogDescription>
              {t(
                'The customer price is generated from upstream purchase cost using the displayed multiplier.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='bg-muted/40 rounded-lg border p-4'>
              <p className='text-muted-foreground text-sm'>
                {t('Customer price rule')}
              </p>
              <p className='mt-1 text-lg font-semibold'>
                {t('Purchase cost × {{factor}}', {
                  factor: formatSellingFactor(
                    formulaItem?.selling_factor ?? ''
                  ),
                })}
              </p>
            </div>
            <div className='flex flex-col gap-2'>
              <p className='font-medium'>{t('Technical billing expression')}</p>
              <pre className='bg-muted max-h-80 overflow-auto rounded-lg border p-4 text-xs whitespace-pre-wrap'>
                {formulaItem?.sales_billing_expr}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SalesPriceDetailsDialog
        item={priceDetailsItem}
        onOpenChange={(open) => {
          if (!open) setPriceDetailsItem(undefined)
        }}
      />
      {overrideTarget ? (
        <ChannelModelOverrideDialog
          open
          version={props.version}
          modelName={overrideTarget.item.model_name}
          channel={overrideTarget.channel}
          onOpenChange={(open) => {
            if (!open) setOverrideTarget(undefined)
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteItems.length > 0}
        onOpenChange={(open) => {
          if (!open && !props.isDeleting) setDeleteItems([])
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Delete model sales prices')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItems.length === 1
                ? deleteItems[0]?.model_name
                : t('{{count}} selected model prices', {
                    count: deleteItems.length,
                  })}
              <br />
              {t('This action cannot be undone.')}{' '}
              {t(
                'This removes the prices from the current draft. Related pending reviews will also be closed.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.isDeleting}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={props.isDeleting}
              onClick={(event) => {
                event.preventDefault()
                if (deleteItems.length === 0) return
                const itemIds = deleteItems.map((item) => item.id)
                void Promise.resolve(
                  props.onDelete(itemIds.length === 1 ? itemIds[0] : itemIds)
                )
                  .then(() => {
                    setDeleteItems([])
                    setSelectedIds(new Set())
                  })
                  .catch(() => undefined)
              }}
            >
              {props.isDeleting ? <Spinner data-icon='inline-start' /> : null}
              {t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
