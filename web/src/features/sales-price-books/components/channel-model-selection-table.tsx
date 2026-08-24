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

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
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
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onFiltersChange: (filters: ChannelModelFilterValues) => void
  onSelectionChange: (selectedIds: Set<number>) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function ChannelModelSelectionTable(
  props: SupportedChannelModelTableProps
) {
  const { t } = useTranslation()
  let selectedOnPage = 0
  for (const item of props.items) {
    if (props.selectedIds.has(item.id)) selectedOnPage += 1
  }
  const allRowsOnPageSelected =
    props.items.length > 0 && selectedOnPage === props.items.length
  const someRowsOnPageSelected =
    selectedOnPage > 0 && selectedOnPage < props.items.length

  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>{t('Supported channel models')}</CardTitle>
        <CardDescription>
          {t(
            'Channel models with active official and purchase prices are included.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <ChannelModelFilters
          idPrefix='sales-price-book-generator'
          value={props.filters}
          channels={props.channels}
          onChange={props.onFiltersChange}
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-muted-foreground text-sm'>
            {t('{{count}} selected', { count: props.selectedIds.size })}
          </p>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={props.items.length === 0}
              onClick={() => {
                const next = new Set(props.selectedIds)
                for (const item of props.items) {
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
              {t('Select current page')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={props.items.length === 0}
              onClick={() => {
                const next = new Set(props.selectedIds)
                for (const item of props.items) {
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
            className='rounded-lg border'
          >
            <Table className='min-w-max'>
              <TableHeader className='bg-card sticky top-0 z-10'>
                <TableRow>
                  <TableHead className='w-12'>
                    <Checkbox
                      checked={allRowsOnPageSelected}
                      indeterminate={someRowsOnPageSelected}
                      aria-label={t('Select current page')}
                      onCheckedChange={(checked) => {
                        const next = new Set(props.selectedIds)
                        for (const item of props.items) {
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {!props.isLoading && !props.isError && props.total > 0 ? (
          <ChannelModelPagination
            page={props.page}
            pageSize={props.pageSize}
            total={props.total}
            isFetching={props.isFetching}
            onPageChange={props.onPageChange}
            onPageSizeChange={props.onPageSizeChange}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
