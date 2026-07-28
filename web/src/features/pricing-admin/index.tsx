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
import { CircleAlert, DatabaseZap, Plus, RefreshCw, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  getChannelModels,
  getModelPriceOverview,
  importLegacyOfficialPrices,
  syncLegacyChannelModels,
} from './api'
import { ChannelModelDialog } from './components/channel-model-dialog'
import { ModelPriceOverview } from './components/model-price-overview'
import { PriceEditorSheet } from './components/price-editor-sheet'
import type { ChannelModel } from './types'

export function PricingAdmin() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [selectedChannelModel, setSelectedChannelModel] =
    useState<ChannelModel | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editingChannelModel, setEditingChannelModel] =
    useState<ChannelModel | null>(null)
  const deferredKeyword = useDeferredValue(keyword)
  const channelModelsQuery = useQuery({
    queryKey: ['pricing-admin', 'channel-models', deferredKeyword],
    queryFn: () =>
      getChannelModels({
        keyword: deferredKeyword.trim() || undefined,
        page: 1,
        page_size: 100,
      }),
  })
  const overviewQuery = useQuery({
    queryKey: ['pricing-admin', 'model-price-overview', deferredKeyword],
    queryFn: () => getModelPriceOverview(deferredKeyword.trim() || undefined),
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
    },
  })
  const importMutation = useMutation({
    mutationFn: importLegacyOfficialPrices,
    onSuccess: (response) => {
      toast.success(
        t('Legacy price drafts imported: {{count}} created', {
          count: response.data.created,
        })
      )
    },
  })
  const rows = channelModelsQuery.data?.data.items ?? []
  const isMutating = syncMutation.isPending || importMutation.isPending

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Channel Model Pricing')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' onClick={() => setCreateDialogOpen(true)}>
          <Plus data-icon='inline-start' />
          {t('Create Channel Model')}
        </Button>
        <Button
          variant='outline'
          disabled={isMutating}
          onClick={() => importMutation.mutate()}
        >
          <DatabaseZap data-icon='inline-start' />
          {t('Import Legacy Prices')}
        </Button>
        <Button disabled={isMutating} onClick={() => syncMutation.mutate()}>
          <RefreshCw data-icon='inline-start' />
          {t('Sync Channel Models')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='h-full space-y-4 overflow-auto'>
          <Alert>
            <CircleAlert />
            <AlertTitle>{t('Legacy runtime remains active')}</AlertTitle>
            <AlertDescription>
              {t(
                'The pricing catalog is isolated from routing and billing until V2 is enabled per model.'
              )}
            </AlertDescription>
          </Alert>

          <FieldGroup>
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
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </InputGroup>
            </Field>
          </FieldGroup>

          <ModelPriceOverview
            items={overviewQuery.data?.data ?? []}
            isLoading={overviewQuery.isLoading}
          />

          <h2 className='font-medium'>{t('Channel Model List')}</h2>
          <div className='overflow-hidden rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Channel')}</TableHead>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead>{t('Upstream Model')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Priority')}</TableHead>
                  <TableHead>{t('Weight')}</TableHead>
                  <TableHead>{t('Runtime Mode')}</TableHead>
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
                      <Badge variant='outline'>{row.runtime_mode}</Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex justify-end gap-2'>
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
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setSelectedChannelModel(row)}
                        >
                          {t('Manage Pricing')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!channelModelsQuery.isLoading && rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className='text-muted-foreground h-24 text-center'
                    >
                      {t('No channel models found')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <PriceEditorSheet
            channelModel={selectedChannelModel}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedChannelModel(null)
              }
            }}
          />
          <ChannelModelDialog
            open={createDialogOpen}
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
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
