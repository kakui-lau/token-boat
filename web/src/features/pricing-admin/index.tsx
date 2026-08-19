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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BadgeDollarSign,
  Download,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  deleteSelectedChannelModels,
  exportChannelModelPrices,
  exportSelectedChannelModelPrices,
  exportSelectedPricingComparison,
  exportSelectedPurchaseDiscounts,
  getChannelModels,
  getPricingCatalogOptions,
  setPricingModelRuntime,
  syncLegacyChannelModels,
} from './api'
import { ChannelModelDialog } from './components/channel-model-dialog'
import { ChannelModelFilters } from './components/channel-model-filters'
import { ChannelModelPagination } from './components/channel-model-pagination'
import { PriceEditorSheet } from './components/price-editor-sheet'
import { PricingRuntimeStatus } from './components/pricing-runtime-status'
import {
  EMPTY_CHANNEL_MODEL_FILTERS,
  type ChannelModelFilterValues,
} from './lib/channel-model-filters'
import type { ChannelModel } from './types'

function downloadCSV(blob: Blob, filenamePrefix: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filenamePrefix}-${new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '')}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function PricingAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const canWrite = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.WRITE
  )
  const canPublish = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.PUBLISH
  )
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const [filters, setFilters] = useState<ChannelModelFilterValues>({
    ...EMPTY_CHANNEL_MODEL_FILTERS,
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedChannelModel, setSelectedChannelModel] =
    useState<ChannelModel | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingChannelModel, setEditingChannelModel] =
    useState<ChannelModel | null>(null)
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false)
  const [pendingV2ModelName, setPendingV2ModelName] = useState<string | null>(
    null
  )
  const deferredKeyword = useDeferredValue(filters.keyword)
  const catalogQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options'],
    queryFn: () => getPricingCatalogOptions(),
  })
  const channelModelsQuery = useQuery({
    queryKey: [
      'pricing-admin',
      'channel-models',
      deferredKeyword,
      filters.channelId,
      filters.status,
      filters.routingStatus,
      filters.runtimeMode,
      filters.retailStatus,
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
        runtime_mode:
          filters.runtimeMode === 'legacy' || filters.runtimeMode === 'v2'
            ? filters.runtimeMode
            : undefined,
        retail_status:
          filters.retailStatus === 'published' ||
          filters.retailStatus === 'unpublished'
            ? filters.retailStatus
            : undefined,
        page,
        page_size: pageSize,
      }),
  })
  const syncMutation = useMutation({
    mutationFn: syncLegacyChannelModels,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'channel-models'],
      })
      const unknownModels = response.data.unknown_model_names ?? []
      if (unknownModels.length > 0) {
        toast.warning(
          t(
            'Some models were skipped because they are missing from the model catalog: {{models}}',
            { models: unknownModels.join(', ') }
          )
        )
      } else {
        toast.success(
          t('Channel models synchronized: {{count}} created', {
            count: response.data.created,
          })
        )
      }
      setPendingV2ModelName(null)
    },
    onError: handleServerError,
  })
  const runtimeMutation = useMutation({
    mutationFn: (input: { model_name: string; runtime_mode: 'v2' }) =>
      setPricingModelRuntime(input),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['pricing-admin', 'channel-models'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['pricing-admin', 'runtime-status'],
        }),
      ])
      toast.success(
        t('V2 enabled for {{count}} channel models', {
          count: response.data.updated,
        })
      )
    },
  })
  const exportAllMutation = useMutation({
    mutationFn: () =>
      exportChannelModelPrices({
        keyword: deferredKeyword.trim() || undefined,
        channel_id: filters.channelId ? Number(filters.channelId) : undefined,
        status: filters.status ? Number(filters.status) : undefined,
        routing_status:
          filters.routingStatus === 'available' ||
          filters.routingStatus === 'removed'
            ? filters.routingStatus
            : undefined,
        runtime_mode:
          filters.runtimeMode === 'legacy' || filters.runtimeMode === 'v2'
            ? filters.runtimeMode
            : undefined,
        retail_status:
          filters.retailStatus === 'published' ||
          filters.retailStatus === 'unpublished'
            ? filters.retailStatus
            : undefined,
      }),
    onSuccess: (blob) => downloadCSV(blob, 'channel-pricing'),
    onError: handleServerError,
  })
  const exportSelectedMutation = useMutation({
    mutationFn: (channelModelIds: number[]) =>
      exportSelectedChannelModelPrices(channelModelIds),
    onSuccess: (blob) => downloadCSV(blob, 'channel-pricing'),
    onError: handleServerError,
  })
  const exportSelectedPurchaseDiscountsMutation = useMutation({
    mutationFn: (channelModelIds: number[]) =>
      exportSelectedPurchaseDiscounts(channelModelIds),
    onSuccess: (blob) => downloadCSV(blob, 'selected-purchase-discounts'),
    onError: handleServerError,
  })
  const exportSelectedPricingComparisonMutation = useMutation({
    mutationFn: (channelModelIds: number[]) =>
      exportSelectedPricingComparison(channelModelIds),
    onSuccess: (blob) => downloadCSV(blob, 'selected-pricing-comparison'),
    onError: handleServerError,
  })
  const deleteSelectedMutation = useMutation({
    mutationFn: (channelModelIds: number[]) =>
      deleteSelectedChannelModels(channelModelIds),
    onSuccess: async (response) => {
      setDeleteSelectedOpen(false)
      setSelectedIds(new Set())
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['pricing-admin', 'channel-models'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['pricing-admin', 'runtime-status'],
        }),
      ])
      toast.success(
        t('{{count}} channel model(s) deleted', {
          count: response.data.deleted,
        })
      )
    },
    onError: handleServerError,
  })
  const rows = channelModelsQuery.data?.data.items ?? []
  const total = channelModelsQuery.data?.data.total ?? 0
  let selectedOnPage = 0
  for (const row of rows) {
    if (selectedIds.has(row.id)) selectedOnPage += 1
  }
  const allRowsOnPageSelected =
    rows.length > 0 && selectedOnPage === rows.length
  const someRowsOnPageSelected =
    selectedOnPage > 0 && selectedOnPage < rows.length

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Channel Pricing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {canExport ? (
          <>
            <Button
              variant='outline'
              disabled={exportAllMutation.isPending}
              onClick={() => exportAllMutation.mutate()}
            >
              <Download data-icon='inline-start' />
              {t('Export filtered results')}
            </Button>
            <Button
              disabled={
                selectedIds.size === 0 || exportSelectedMutation.isPending
              }
              onClick={() =>
                exportSelectedMutation.mutate(
                  [...selectedIds].sort((left, right) => left - right)
                )
              }
            >
              <Download data-icon='inline-start' />
              {t('Export selected ({{count}})', { count: selectedIds.size })}
            </Button>
            <Button
              variant='outline'
              disabled={
                selectedIds.size === 0 ||
                exportSelectedPurchaseDiscountsMutation.isPending
              }
              onClick={() =>
                exportSelectedPurchaseDiscountsMutation.mutate(
                  [...selectedIds].sort((left, right) => left - right)
                )
              }
            >
              <Download data-icon='inline-start' />
              {t('Export selected purchase discounts')}
            </Button>
            <Button
              variant='outline'
              disabled={
                selectedIds.size === 0 ||
                exportSelectedPricingComparisonMutation.isPending
              }
              onClick={() =>
                exportSelectedPricingComparisonMutation.mutate(
                  [...selectedIds].sort((left, right) => left - right)
                )
              }
            >
              <Download data-icon='inline-start' />
              {t('Export selected pricing comparison')}
            </Button>
          </>
        ) : null}
        {canWrite ? (
          <Button
            variant='destructive'
            disabled={
              selectedIds.size === 0 || deleteSelectedMutation.isPending
            }
            onClick={() => setDeleteSelectedOpen(true)}
          >
            <Trash2 data-icon='inline-start' />
            {t('Delete selected ({{count}})', { count: selectedIds.size })}
          </Button>
        ) : null}
        <Button
          variant='outline'
          render={<Link to='/official-pricing' search={{}} />}
          nativeButton={false}
        >
          <BadgeDollarSign data-icon='inline-start' />
          {t('Official Pricing')}
        </Button>
        {canWrite ? (
          <>
            <Button variant='outline' onClick={() => setCreateDialogOpen(true)}>
              <Plus data-icon='inline-start' />
              {t('Add Model')}
            </Button>
            <Button
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <RefreshCw data-icon='inline-start' />
              {t('Sync Catalog')}
            </Button>
          </>
        ) : null}
      </SectionPageLayout.Actions>
      <PricingRuntimeStatus />
      <SectionPageLayout.Content>
        <div className='flex h-full flex-col gap-4 overflow-auto'>
          <ChannelModelFilters
            idPrefix='pricing-admin'
            value={filters}
            channels={catalogQuery.data?.data.channels ?? []}
            onChange={(nextFilters) => {
              setFilters(nextFilters)
              setPage(1)
              setSelectedIds(new Set())
            }}
          />

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h2 className='font-medium'>{t('Channel Models')}</h2>
              <p className='text-muted-foreground text-sm'>
                {t('{{count}} selected', { count: selectedIds.size })}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={rows.length === 0}
                onClick={() => {
                  setSelectedIds((current) => {
                    const next = new Set(current)
                    for (const row of rows) next.add(row.id)
                    return next
                  })
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
                disabled={rows.length === 0}
                onClick={() => {
                  setSelectedIds((current) => {
                    const next = new Set(current)
                    for (const row of rows) {
                      if (next.has(row.id)) next.delete(row.id)
                      else next.add(row.id)
                    }
                    return next
                  })
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
                disabled={selectedIds.size === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                {t('Clear selection')}
              </Button>
            </div>
          </div>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-12'>
                    <Checkbox
                      checked={allRowsOnPageSelected}
                      indeterminate={someRowsOnPageSelected}
                      aria-label={t('Select current page')}
                      onCheckedChange={(checked) => {
                        setSelectedIds((current) => {
                          const next = new Set(current)
                          for (const row of rows) {
                            if (checked) next.add(row.id)
                            else next.delete(row.id)
                          }
                          return next
                        })
                      }}
                    />
                  </TableHead>
                  <TableHead>{t('Channel')}</TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Provider Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Routing')}</TableHead>
                  <TableHead>{t('Priority')}</TableHead>
                  <TableHead>{t('Weight')}</TableHead>
                  <TableHead>{t('Runtime')}</TableHead>
                  <TableHead>{t('Retail Status')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={
                      selectedIds.has(row.id) ? 'selected' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        aria-label={t('Select {{model}}', {
                          model: row.model_name,
                        })}
                        onCheckedChange={(checked) => {
                          setSelectedIds((current) => {
                            const next = new Set(current)
                            if (checked) next.add(row.id)
                            else next.delete(row.id)
                            return next
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>{row.channel_name}</TableCell>
                    <TableCell className='font-medium'>
                      {row.model_name}
                    </TableCell>
                    <TableCell>{row.upstream_model_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === 1 ? 'default' : 'secondary'}
                      >
                        {row.status === 1 ? t('Enabled') : t('Disabled')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.routing_enabled ? 'default' : 'destructive'
                        }
                      >
                        {row.routing_enabled
                          ? t('Available')
                          : t('Removed from channel')}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.priority}</TableCell>
                    <TableCell>{row.weight}</TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {row.runtime_mode === 'v2'
                          ? t('V2 Pricing')
                          : t('Legacy Billing')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.active_retail_price_version_id > 0 ? (
                        <div className='flex items-center gap-2'>
                          <Badge>{t('Published')}</Badge>
                          <span className='text-muted-foreground font-mono text-xs'>
                            v{row.active_retail_price_version}
                          </span>
                        </div>
                      ) : (
                        <Badge variant='secondary'>{t('Not Published')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
                        {canWrite && row.runtime_mode !== 'v2' ? (
                          <Button
                            size='sm'
                            disabled={runtimeMutation.isPending}
                            onClick={() =>
                              setPendingV2ModelName(row.model_name)
                            }
                          >
                            {t('Enable Model V2')}
                          </Button>
                        ) : null}
                        {canWrite ? (
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => {
                              setEditingChannelModel(row)
                              setCreateDialogOpen(true)
                            }}
                          >
                            {t('Edit')}
                          </Button>
                        ) : null}
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setSelectedChannelModel(row)}
                        >
                          {t('Configure')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!channelModelsQuery.isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className='text-muted-foreground h-24 text-center'
                    >
                      {t('No channel models found')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <ChannelModelPagination
            page={page}
            pageSize={pageSize}
            total={total}
            isFetching={channelModelsQuery.isFetching}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
          <PriceEditorSheet
            channelModel={selectedChannelModel}
            canWrite={canWrite}
            canPublish={canPublish}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedChannelModel(null)
              }
            }}
          />
          <ChannelModelDialog
            open={canWrite && createDialogOpen}
            channelModel={editingChannelModel}
            onOpenChange={(open) => {
              setCreateDialogOpen(open)
              if (!open) {
                setEditingChannelModel(null)
              }
            }}
            onCreated={async () => {
              await channelModelsQuery.refetch()
            }}
          />
          <ConfirmDialog
            open={canWrite && deleteSelectedOpen}
            onOpenChange={(open) => {
              if (!deleteSelectedMutation.isPending) {
                setDeleteSelectedOpen(open)
              }
            }}
            title={t('Delete selected channel models?')}
            desc={
              <div className='space-y-2'>
                <p>
                  {t(
                    'You are about to delete {{count}} channel model(s). Only models removed from routing can be deleted.',
                    { count: selectedIds.size }
                  )}
                </p>
                <p>{t('This action cannot be undone.')}</p>
              </div>
            }
            confirmText={t('Delete selected ({{count}})', {
              count: selectedIds.size,
            })}
            destructive
            isLoading={deleteSelectedMutation.isPending}
            handleConfirm={() => {
              deleteSelectedMutation.mutate(
                [...selectedIds].sort((left, right) => left - right)
              )
            }}
          />
          <ConfirmDialog
            open={canWrite && pendingV2ModelName !== null}
            onOpenChange={(open) => {
              if (!open && !runtimeMutation.isPending) {
                setPendingV2ModelName(null)
              }
            }}
            title={t('Enable Model V2')}
            desc={
              <div className='space-y-2'>
                <p className='text-foreground font-mono font-medium'>
                  {pendingV2ModelName}
                </p>
                <p>{t('This action cannot be undone.')}</p>
              </div>
            }
            confirmText={t('Enable Model V2')}
            isLoading={runtimeMutation.isPending}
            handleConfirm={() => {
              if (pendingV2ModelName) {
                runtimeMutation.mutate({
                  model_name: pendingV2ModelName,
                  runtime_mode: 'v2',
                })
              }
            }}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
