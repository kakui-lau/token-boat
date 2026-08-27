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
  ArrowReloadHorizontalIcon,
  CheckListIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircle, Database } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ChannelModelFilters } from '@/features/pricing-admin/components/channel-model-filters'
import { ChannelModelPagination } from '@/features/pricing-admin/components/channel-model-pagination'
import type { ChannelModelFilterValues } from '@/features/pricing-admin/lib/channel-model-filters'
import type { ChannelModel } from '@/features/pricing-admin/types'

type SupportedChannelModelTableProps = {
  items: ChannelModel[]
  filters: ChannelModelFilterValues
  channels: Array<{ id: number; name: string }>
  selectedIds: Set<number>
  generatedModelIds: ReadonlySet<number>
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onFiltersChange: (filters: ChannelModelFilterValues) => void
  onSelectionChange: (selectedIds: Set<number>) => void
  onSelectAllMatching?: () => void
  onSelectAllMatchingUngenerated?: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

function canGenerateSalesPriceFromChannelModel(item: ChannelModel) {
  return item.status === 1 && item.active_purchase_price_version_id > 0
}

export function ChannelModelSelectionTable(
  props: SupportedChannelModelTableProps
) {
  const { t } = useTranslation()
  const selectableItems = props.items.filter(
    canGenerateSalesPriceFromChannelModel
  )
  const ungeneratedSelectableItems = selectableItems.filter(
    (item) => !props.generatedModelIds.has(item.model_id)
  )
  const generatedOnPage = props.items.filter((item) =>
    props.generatedModelIds.has(item.model_id)
  ).length
  const notGeneratedOnPage = props.items.length - generatedOnPage
  let selectedOnPage = 0
  for (const item of selectableItems) {
    if (props.selectedIds.has(item.id)) selectedOnPage += 1
  }
  const allRowsOnPageSelected =
    selectableItems.length > 0 && selectedOnPage === selectableItems.length
  const someRowsOnPageSelected =
    selectedOnPage > 0 && selectedOnPage < selectableItems.length
  const hiddenSelectedCount = Math.max(
    0,
    props.selectedIds.size - selectedOnPage
  )

  return (
    <Card className='h-full min-h-[40rem] lg:min-h-0'>
      <CardHeader className='shrink-0'>
        <CardTitle>{t('Supported channel models')}</CardTitle>
        <CardDescription>
          {t(
            'Channel models with active official and purchase prices are included.'
          )}
          <span className='mt-1 block'>
            {t(
              'Models already present in this draft are marked as generated. Selecting them again recalculates and replaces their prices.'
            )}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className='flex min-h-0 flex-1 flex-col gap-4'>
        <ChannelModelFilters
          idPrefix='sales-price-book-generator'
          value={props.filters}
          channels={props.channels}
          onChange={props.onFiltersChange}
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline'>
              {t('Selected on current page: {{count}}', {
                count: selectedOnPage,
              })}
            </Badge>
            <Badge
              variant={hiddenSelectedCount > 0 ? 'destructive' : 'outline'}
            >
              {t('Selected outside current page: {{count}}', {
                count: hiddenSelectedCount,
              })}
            </Badge>
            <Badge variant='secondary'>
              {t('Generated on this page')}: {generatedOnPage}
            </Badge>
            <Badge variant='outline'>
              {t('Not generated on this page')}: {notGeneratedOnPage}
            </Badge>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={props.total === 0 || props.isFetching}
              onClick={props.onSelectAllMatchingUngenerated}
            >
              {t('Select all ungenerated matching filters')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={props.total === 0 || props.isFetching}
              onClick={props.onSelectAllMatching}
            >
              {t('Select all {{count}} matching', { count: props.total })}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={ungeneratedSelectableItems.length === 0}
              onClick={() => {
                props.onSelectionChange(
                  new Set(ungeneratedSelectableItems.map((item) => item.id))
                )
              }}
            >
              <HugeiconsIcon
                icon={CheckListIcon}
                strokeWidth={2}
                data-icon='inline-start'
              />
              {t('Select ungenerated on current page')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={selectableItems.length === 0}
              onClick={() => {
                props.onSelectionChange(
                  new Set(selectableItems.map((item) => item.id))
                )
              }}
            >
              <HugeiconsIcon
                icon={CheckListIcon}
                strokeWidth={2}
                data-icon='inline-start'
              />
              {t('Select current page')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={selectableItems.length === 0}
              onClick={() => {
                const next = new Set(props.selectedIds)
                for (const item of selectableItems) {
                  next.add(item.id)
                }
                props.onSelectionChange(next)
              }}
            >
              <HugeiconsIcon
                icon={CheckListIcon}
                strokeWidth={2}
                data-icon='inline-start'
              />
              {t('Add current page to selection')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={selectableItems.length === 0}
              onClick={() => {
                const next = new Set(props.selectedIds)
                for (const item of selectableItems) {
                  if (next.has(item.id)) {
                    next.delete(item.id)
                  } else {
                    next.add(item.id)
                  }
                }
                props.onSelectionChange(next)
              }}
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                strokeWidth={2}
                data-icon='inline-start'
              />
              {t('Invert current page')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              disabled={props.selectedIds.size === 0}
              onClick={() => props.onSelectionChange(new Set())}
            >
              {t('Clear selection')}
            </Button>
          </div>
        </div>
        {hiddenSelectedCount > 0 ? (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertTitle>
              {t('Selected outside current page: {{count}}', {
                count: hiddenSelectedCount,
              })}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Hidden selected channel models: {{count}}. They will also be generated.',
                { count: hiddenSelectedCount }
              )}
            </AlertDescription>
          </Alert>
        ) : null}
        {props.isLoading ? <Skeleton className='h-48 w-full' /> : null}
        {props.isError ? (
          <Alert variant='destructive'>
            <AlertCircle />
            <AlertDescription>
              {t('Failed to load supported channel models.')}
            </AlertDescription>
            <AlertAction>
              <Button size='sm' variant='outline' onClick={props.onRetry}>
                {t('Retry')}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {!props.isLoading && !props.isError && props.items.length === 0 ? (
          <Empty className='min-h-40'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Database />
              </EmptyMedia>
              <EmptyTitle>{t('No supported channel models')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Publish official and purchase prices before generating sales prices.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {!props.isLoading && !props.isError && props.items.length > 0 ? (
          <div
            data-testid='supported-channel-model-scroll'
            className='min-h-48 flex-1 overflow-auto rounded-lg border'
          >
            <Table className='min-w-max'>
              <TableHeader className='bg-card sticky top-0 z-10'>
                <TableRow>
                  <TableHead className='w-12'>
                    <Checkbox
                      checked={allRowsOnPageSelected}
                      indeterminate={someRowsOnPageSelected}
                      disabled={selectableItems.length === 0}
                      aria-label={t('Select current page')}
                      onCheckedChange={(checked) => {
                        const next = new Set(props.selectedIds)
                        for (const item of selectableItems) {
                          if (checked) next.add(item.id)
                          else next.delete(item.id)
                        }
                        props.onSelectionChange(next)
                      }}
                    />
                  </TableHead>
                  <TableHead>{t('Model Name')}</TableHead>
                  <TableHead>{t('Channel')}</TableHead>
                  <TableHead>{t('Upstream Model')}</TableHead>
                  <TableHead>{t('Purchase pricing mode')}</TableHead>
                  <TableHead>{t('Purchase Discount')}</TableHead>
                  <TableHead>{t('Purchase Status')}</TableHead>
                  <TableHead>{t('Generation status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.items.map((item) => (
                  <TableRow
                    key={item.id}
                    data-state={
                      props.selectedIds.has(item.id) ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={props.selectedIds.has(item.id)}
                        disabled={!canGenerateSalesPriceFromChannelModel(item)}
                        aria-label={t('Select {{model}}', {
                          model: item.model_name,
                        })}
                        onCheckedChange={(checked) => {
                          const next = new Set(props.selectedIds)
                          if (checked) next.add(item.id)
                          else next.delete(item.id)
                          props.onSelectionChange(next)
                        }}
                      />
                    </TableCell>
                    <TableCell className='font-medium'>
                      {item.model_name}
                    </TableCell>
                    <TableCell>{item.channel_name}</TableCell>
                    <TableCell>{item.upstream_model_name}</TableCell>
                    <TableCell>{item.purchase_pricing_mode}</TableCell>
                    <TableCell>{item.purchase_discount || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.active_purchase_price_version_id > 0
                            ? 'default'
                            : 'outline'
                        }
                      >
                        {item.active_purchase_price_version_id > 0
                          ? t('Published')
                          : t('Not Published')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          props.generatedModelIds.has(item.model_id)
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {props.generatedModelIds.has(item.model_id)
                          ? t('Generated')
                          : t('Not generated')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {!props.isLoading && !props.isError ? (
          <div className='shrink-0'>
            <ChannelModelPagination
              page={props.page}
              pageSize={props.pageSize}
              total={props.total}
              isFetching={props.isFetching}
              onPageChange={props.onPageChange}
              onPageSizeChange={props.onPageSizeChange}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
