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
import { Link } from '@tanstack/react-router'
import {
  BadgeDollarSign,
  Download,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
  exportChannelModelPrices,
  getChannelModels,
  getPricingCatalogOptions,
  setPricingModelRuntime,
  syncLegacyChannelModels,
} from './api'
import { ChannelModelDialog } from './components/channel-model-dialog'
import { PriceEditorSheet } from './components/price-editor-sheet'
import { PricingRuntimeStatus } from './components/pricing-runtime-status'
import type { ChannelModel } from './types'

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
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [channelId, setChannelId] = useState('')
  const [status, setStatus] = useState('')
  const [runtimeMode, setRuntimeMode] = useState('')
  const [retailStatus, setRetailStatus] = useState('')
  const [selectedChannelModel, setSelectedChannelModel] =
    useState<ChannelModel | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingChannelModel, setEditingChannelModel] =
    useState<ChannelModel | null>(null)
  const [pendingV2ModelName, setPendingV2ModelName] = useState<string | null>(
    null
  )
  const deferredKeyword = useDeferredValue(keyword)
  const catalogQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options'],
    queryFn: () => getPricingCatalogOptions(),
  })
  const channelModelsQuery = useQuery({
    queryKey: [
      'pricing-admin',
      'channel-models',
      deferredKeyword,
      channelId,
      status,
      runtimeMode,
      retailStatus,
      page,
    ],
    queryFn: () =>
      getChannelModels({
        keyword: deferredKeyword.trim() || undefined,
        channel_id: channelId ? Number(channelId) : undefined,
        status: status ? Number(status) : undefined,
        runtime_mode:
          runtimeMode === 'legacy' || runtimeMode === 'v2'
            ? runtimeMode
            : undefined,
        retail_status:
          retailStatus === 'published' || retailStatus === 'unpublished'
            ? retailStatus
            : undefined,
        page,
        page_size: 50,
      }),
  })
  const syncMutation = useMutation({
    mutationFn: syncLegacyChannelModels,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'channel-models'],
      })
      toast.success(
        t('Channel models synchronized: {{count}} created', {
          count: response.data.created,
        })
      )
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
  const exportMutation = useMutation({
    mutationFn: () =>
      exportChannelModelPrices({
        keyword: deferredKeyword.trim() || undefined,
        channel_id: channelId ? Number(channelId) : undefined,
        status: status ? Number(status) : undefined,
        runtime_mode:
          runtimeMode === 'legacy' || runtimeMode === 'v2'
            ? runtimeMode
            : undefined,
        retail_status:
          retailStatus === 'published' || retailStatus === 'unpublished'
            ? retailStatus
            : undefined,
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `channel-pricing-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    onError: handleServerError,
  })
  const rows = channelModelsQuery.data?.data.items ?? []
  const total = channelModelsQuery.data?.data.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Channel Pricing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        {canExport ? (
          <Button
            variant='outline'
            disabled={exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <Download data-icon='inline-start' />
            {t('Export filtered CSV')}
          </Button>
        ) : null}
        <Button
          variant='outline'
          render={<Link to='/official-pricing' search={{}} />}
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
        <div className='h-full space-y-4 overflow-auto'>
          <FieldGroup className='flex-row flex-wrap items-end gap-3'>
            <Field className='max-w-md'>
              <FieldLabel htmlFor='pricing-admin-search' className='sr-only'>
                {t('Search channels or models')}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden='true' />
                </InputGroupAddon>
                <InputGroupInput
                  id='pricing-admin-search'
                  value={keyword}
                  placeholder={t('Search channels or models')}
                  onChange={(event) => {
                    setKeyword(event.target.value)
                    setPage(1)
                  }}
                />
              </InputGroup>
            </Field>
            <Field className='w-auto'>
              <FieldLabel htmlFor='pricing-admin-channel'>
                {t('Channel')}
              </FieldLabel>
              <NativeSelect
                id='pricing-admin-channel'
                className='w-48'
                value={channelId}
                onChange={(event) => {
                  setChannelId(event.target.value)
                  setPage(1)
                }}
              >
                <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
                {(catalogQuery.data?.data.channels ?? []).map((channel) => (
                  <NativeSelectOption
                    key={channel.id}
                    value={String(channel.id)}
                  >
                    {channel.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className='w-auto'>
              <FieldLabel htmlFor='pricing-admin-status'>
                {t('Status')}
              </FieldLabel>
              <NativeSelect
                id='pricing-admin-status'
                className='w-36'
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value)
                  setPage(1)
                }}
              >
                <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
                <NativeSelectOption value='1'>
                  {t('Enabled')}
                </NativeSelectOption>
                <NativeSelectOption value='0'>
                  {t('Disabled')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field className='w-auto'>
              <FieldLabel htmlFor='pricing-admin-runtime'>
                {t('Runtime')}
              </FieldLabel>
              <NativeSelect
                id='pricing-admin-runtime'
                className='w-40'
                value={runtimeMode}
                onChange={(event) => {
                  setRuntimeMode(event.target.value)
                  setPage(1)
                }}
              >
                <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
                <NativeSelectOption value='legacy'>
                  {t('Legacy Billing')}
                </NativeSelectOption>
                <NativeSelectOption value='v2'>
                  {t('V2 Pricing')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field className='w-auto'>
              <FieldLabel htmlFor='pricing-admin-retail-status'>
                {t('Retail Status')}
              </FieldLabel>
              <NativeSelect
                id='pricing-admin-retail-status'
                className='w-40'
                value={retailStatus}
                onChange={(event) => {
                  setRetailStatus(event.target.value)
                  setPage(1)
                }}
              >
                <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
                <NativeSelectOption value='published'>
                  {t('Published')}
                </NativeSelectOption>
                <NativeSelectOption value='unpublished'>
                  {t('Not Published')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </FieldGroup>

          <h2 className='font-medium'>{t('Channel Models')}</h2>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
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
                  <TableRow key={row.id}>
                    <TableCell>{row.channel_name}</TableCell>
                    <TableCell className='font-medium'>
                      {row.model_name}
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
                    <TableCell>{row.upstream_model_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === 1 ? 'default' : 'secondary'}
                      >
                        {row.status === 1 ? t('Enabled') : t('Disabled')}
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
                      colSpan={10}
                      className='text-muted-foreground h-24 text-center'
                    >
                      {t('No channel models found')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <div className='flex items-center justify-between'>
            <p className='text-muted-foreground text-sm'>
              {t('{{total}} channel models', { total })}
            </p>
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={page <= 1 || channelModelsQuery.isFetching}
                onClick={() => setPage((current) => current - 1)}
              >
                {t('Previous')}
              </Button>
              <span className='text-sm'>
                {t('Page {{page}} of {{total}}', {
                  page,
                  total: totalPages,
                })}
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={page >= totalPages || channelModelsQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </div>
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
