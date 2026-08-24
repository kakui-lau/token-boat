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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import {
  getChannelModels,
  getPricingCatalogOptions,
} from '@/features/pricing-admin/api'
import {
  EMPTY_CHANNEL_MODEL_FILTERS,
  type ChannelModelFilterValues,
} from '@/features/pricing-admin/lib/channel-model-filters'
import { handleServerError } from '@/lib/handle-server-error'

import { generateSalesPriceBookItems } from '../api'
import { ChannelModelSelectionTable } from './channel-model-selection-table'

type GenerateItemsDialogProps = {
  open: boolean
  versionId: number
  onOpenChange: (open: boolean) => void
}

const emptyItems: never[] = []

export function GenerateItemsDialog(props: GenerateItemsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ChannelModelFilterValues>({
    ...EMPTY_CHANNEL_MODEL_FILTERS,
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const deferredKeyword = useDeferredValue(filters.keyword)
  const catalogQuery = useQuery({
    queryKey: ['sales-price-books', 'catalog-options'],
    queryFn: () => getPricingCatalogOptions(),
    enabled: props.open,
  })
  const supportedQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'supported-channel-models',
      deferredKeyword,
      filters.channelId,
      filters.status,
      filters.routingStatus,
      filters.purchaseStatus,
      page,
      pageSize,
    ],
    queryFn: () =>
      getChannelModels({
        keyword: deferredKeyword.trim() || undefined,
        channel_id: filters.channelId ? Number(filters.channelId) : undefined,
        status: filters.status ? Number(filters.status) : undefined,
        routing_status:
          filters.routingStatus === 'available' ||
          filters.routingStatus === 'removed'
            ? filters.routingStatus
            : undefined,
        purchase_status:
          filters.purchaseStatus === 'published' ||
          filters.purchaseStatus === 'unpublished'
            ? filters.purchaseStatus
            : undefined,
        page,
        page_size: pageSize,
      }),
    enabled: props.open,
  })
  const generateMutation = useMutation({
    mutationFn: () =>
      generateSalesPriceBookItems(props.versionId, {
        channel_model_ids: [...selectedIds],
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', props.versionId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions'],
      })
      if (response.data.batch.review_count > 0) {
        toast.warning(
          t('{{count}} model prices require review', {
            count: response.data.batch.review_count,
          })
        )
      } else {
        toast.success(t('Sales price book items generated'))
      }
      setSelectedIds(new Set())
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })

  const data = supportedQuery.data?.data
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='flex max-h-[92vh] max-w-[min(96vw,90rem)] flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t('Generate price book items')}</DialogTitle>
          <DialogDescription>
            {t(
              'Only selected channel models are used. Compatible channels of one logical model are merged into one customer price.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 overflow-auto p-0.5'>
          <ChannelModelSelectionTable
            items={data?.items ?? emptyItems}
            filters={filters}
            channels={catalogQuery.data?.data.channels ?? []}
            selectedIds={selectedIds}
            total={data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            isLoading={supportedQuery.isLoading}
            isFetching={supportedQuery.isFetching}
            isError={supportedQuery.isError}
            onRetry={() => void supportedQuery.refetch()}
            onFiltersChange={(next) => {
              setFilters(next)
              setPage(1)
            }}
            onSelectionChange={setSelectedIds}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next)
              setPage(1)
            }}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={selectedIds.size === 0 || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <Spinner data-icon='inline-start' />
            ) : null}
            {t('Generate selected models')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
