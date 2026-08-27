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
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
  getChannelModelIds,
  getPricingCatalogOptions,
} from '@/features/pricing-admin/api'
import {
  EMPTY_CHANNEL_MODEL_FILTERS,
  type ChannelModelFilterValues,
} from '@/features/pricing-admin/lib/channel-model-filters'
import { handleServerError } from '@/lib/handle-server-error'

import { generateSalesPriceBookItems, getSalesPriceBookItems } from '../api'
import { ChannelModelSelectionTable } from './channel-model-selection-table'

type GenerateItemsDialogProps = {
  open: boolean
  versionId: number
  versionLabel?: string
  onOpenChange: (open: boolean) => void
}

const emptyItems: never[] = []

type ChannelModelSelectionPreview = {
  id: number
  model_id: number
  model_name: string
  channel_name: string
}

export function GenerateItemsDialog(props: GenerateItemsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ChannelModelFilterValues>({
    ...EMPTY_CHANNEL_MODEL_FILTERS,
    status: '1',
    purchaseStatus: 'published',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [confirmationRows, setConfirmationRows] = useState<
    ChannelModelSelectionPreview[]
  >([])
  const deferredKeyword = useDeferredValue(filters.keyword)
  const selectionFilters = useMemo<Parameters<typeof getChannelModels>[0]>(
    () => ({
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
    }),
    [
      deferredKeyword,
      filters.channelId,
      filters.purchaseStatus,
      filters.routingStatus,
      filters.status,
    ]
  )
  useEffect(() => {
    setSelectedIds(new Set())
    setConfirmationOpen(false)
    setConfirmationRows([])
    setPage(1)
  }, [props.versionId])
  const catalogQuery = useQuery({
    queryKey: ['sales-price-books', 'catalog-options'],
    queryFn: () => getPricingCatalogOptions(),
    enabled: props.open,
  })
  const generatedItemsQuery = useQuery({
    queryKey: ['sales-price-books', 'items', props.versionId],
    queryFn: () => getSalesPriceBookItems(props.versionId),
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
        ...selectionFilters,
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
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'version-diff'],
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
      setConfirmationOpen(false)
      setConfirmationRows([])
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })
  const generatedModelIds = useMemo(
    () =>
      new Set(
        (generatedItemsQuery.data?.data ?? []).map((item) => item.model_id)
      ),
    [generatedItemsQuery.data?.data]
  )
  const selectMatchingMutation = useMutation({
    mutationFn: (onlyUngenerated: boolean) =>
      getChannelModelIds(selectionFilters).then((response) => ({
        onlyUngenerated,
        rows: response.data,
      })),
    onSuccess: ({ onlyUngenerated, rows }) => {
      setSelectedIds(
        new Set(
          rows
            .filter(
              (row) => !onlyUngenerated || !generatedModelIds.has(row.model_id)
            )
            .map((row) => row.id)
        )
      )
    },
    onError: handleServerError,
  })
  const selectionPreviewMutation = useMutation({
    mutationFn: () =>
      getChannelModelIds({ status: 1, purchase_status: 'published' }),
    onSuccess: (response) => {
      const rows = response.data.filter((row) => selectedIds.has(row.id))
      if (rows.length !== selectedIds.size) {
        toast.error(
          t(
            'Some selected channel models are no longer available. Refresh and select again.'
          )
        )
        return
      }
      setConfirmationRows(rows)
      setConfirmationOpen(true)
    },
    onError: handleServerError,
  })
  const selectedLogicalModels = useMemo(() => {
    const models = new Map<
      number,
      { modelId: number; modelName: string; channelNames: string[] }
    >()
    for (const row of confirmationRows) {
      const current = models.get(row.model_id)
      if (current) {
        if (!current.channelNames.includes(row.channel_name)) {
          current.channelNames.push(row.channel_name)
        }
        continue
      }
      models.set(row.model_id, {
        modelId: row.model_id,
        modelName: row.model_name,
        channelNames: [row.channel_name],
      })
    }
    return [...models.values()].sort((left, right) =>
      left.modelName.localeCompare(right.modelName)
    )
  }, [confirmationRows])

  const data = supportedQuery.data?.data
  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={(open) => {
          if (generateMutation.isPending) return
          if (!open) {
            setSelectedIds(new Set())
            setConfirmationOpen(false)
            setConfirmationRows([])
          }
          props.onOpenChange(open)
        }}
      >
        <DialogContent
          data-testid='generate-items-dialog'
          className='flex h-[min(92vh,64rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden sm:w-[min(96vw,96rem)] sm:max-w-[min(96vw,96rem)]'
        >
          <DialogHeader className='shrink-0'>
            <DialogTitle>
              {t('Generate prices for {{version}}', {
                version: props.versionLabel ?? `v${props.versionId}`,
              })}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Only selected channel models are used. Compatible channels of one logical model are merged into one customer price.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div
            data-testid='generate-items-dialog-body'
            className='min-h-0 flex-1 overflow-auto p-0.5 lg:overflow-hidden'
          >
            <ChannelModelSelectionTable
              items={data?.items ?? emptyItems}
              filters={filters}
              channels={catalogQuery.data?.data.channels ?? []}
              selectedIds={selectedIds}
              generatedModelIds={generatedModelIds}
              total={data?.total ?? 0}
              page={page}
              pageSize={pageSize}
              isLoading={
                supportedQuery.isLoading || generatedItemsQuery.isLoading
              }
              isFetching={
                supportedQuery.isFetching ||
                generatedItemsQuery.isFetching ||
                selectMatchingMutation.isPending
              }
              isError={supportedQuery.isError || generatedItemsQuery.isError}
              onRetry={() => {
                void supportedQuery.refetch()
                void generatedItemsQuery.refetch()
              }}
              onFiltersChange={(next) => {
                setFilters(next)
                setPage(1)
              }}
              onSelectionChange={setSelectedIds}
              onSelectAllMatching={() => selectMatchingMutation.mutate(false)}
              onSelectAllMatchingUngenerated={() =>
                selectMatchingMutation.mutate(true)
              }
              onPageChange={setPage}
              onPageSizeChange={(next) => {
                setPageSize(next)
                setPage(1)
              }}
            />
          </div>
          <DialogFooter className='shrink-0'>
            <Button
              variant='outline'
              disabled={generateMutation.isPending}
              onClick={() => {
                setSelectedIds(new Set())
                props.onOpenChange(false)
              }}
            >
              {t('Cancel')}
            </Button>
            <Button
              disabled={
                selectedIds.size === 0 ||
                generateMutation.isPending ||
                selectionPreviewMutation.isPending
              }
              onClick={() => selectionPreviewMutation.mutate()}
            >
              {generateMutation.isPending ||
              selectionPreviewMutation.isPending ? (
                <Spinner data-icon='inline-start' />
              ) : null}
              {t('Generate selected models')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={confirmationOpen}
        onOpenChange={(open) => {
          if (generateMutation.isPending) return
          setConfirmationOpen(open)
          if (!open) setConfirmationRows([])
        }}
      >
        <AlertDialogContent className='sm:max-w-3xl'>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm price generation')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Selected channel models: {{channelCount}}; logical models to generate: {{modelCount}}.',
                {
                  channelCount: confirmationRows.length,
                  modelCount: selectedLogicalModels.length,
                }
              )}{' '}
              {t('Review the final selection before generating.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <p className='mb-2 text-sm font-medium'>
              {t('Selected logical models')}
            </p>
            <div
              role='list'
              className='max-h-80 overflow-y-auto rounded-lg border'
            >
              {selectedLogicalModels.map((model) => (
                <div
                  key={model.modelId}
                  role='listitem'
                  className='border-b p-3 last:border-b-0'
                >
                  <p className='font-medium'>{model.modelName}</p>
                  <p className='text-muted-foreground mt-1 text-sm'>
                    {model.channelNames.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generateMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <Spinner data-icon='inline-start' />
              ) : null}
              {selectedLogicalModels.length === 1
                ? t('Generate 1 model')
                : t('Generate {{count}} models', {
                    count: selectedLogicalModels.length,
                  })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
