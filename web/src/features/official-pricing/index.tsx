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
import {
  ArrowLeft,
  BarChart3,
  CheckCheck,
  DatabaseZap,
  Search,
} from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  deletePriceDraft,
  getOfficialPriceOverview,
  getOfficialPriceVersions,
  importLegacyOfficialPrices,
  publishLatestOfficialPriceDrafts,
  publishPriceVersion,
} from '@/features/pricing-admin/api'
import { OfficialPricePanel } from '@/features/pricing-admin/components/official-price-panel'
import type { OfficialPriceOverview } from '@/features/pricing-admin/types'

import { OfficialPriceOverviewTable } from './components/official-price-overview-table'

type OfficialPricingProps = {
  initialModelId?: number
}

const emptyOfficialPriceRows: OfficialPriceOverview[] = []

export function OfficialPricing(props: OfficialPricingProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [bulkPublishOpen, setBulkPublishOpen] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<number | null>(
    props.initialModelId ?? null
  )
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase())
  const overviewQuery = useQuery({
    queryKey: ['pricing-admin', 'official-price-overview'],
    queryFn: () => getOfficialPriceOverview(),
  })
  const rows = overviewQuery.data?.data ?? emptyOfficialPriceRows
  const filteredRows = deferredKeyword
    ? rows.filter((row) =>
        row.model_name.toLowerCase().includes(deferredKeyword)
      )
    : rows
  const selectedModel =
    rows.find((row) => row.model_id === selectedModelId) ?? null
  const officialQueryKey = ['pricing-admin', 'official-prices', selectedModelId]
  const officialQuery = useQuery({
    queryKey: officialQueryKey,
    queryFn: () => getOfficialPriceVersions(selectedModelId ?? 0),
    enabled: selectedModelId !== null,
  })
  const publishMutation = useMutation({
    mutationFn: (id: number) => publishPriceVersion('official', id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: officialQueryKey })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'model-price-overview'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-price-overview'],
      })
      toast.success(t('Price version published'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePriceDraft('official', id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: officialQueryKey })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-price-overview'],
      })
      toast.success(t('Price draft deleted'))
    },
  })
  const importMutation = useMutation({
    mutationFn: importLegacyOfficialPrices,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-prices'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-price-overview'],
      })
      toast.success(
        t(
          'Legacy import completed: {{created}} created, {{existing}} existing, {{unpriced}} unpriced',
          {
            created: response.data.created,
            existing: response.data.skipped_existing ?? 0,
            unpriced: response.data.skipped_unpriced ?? 0,
          }
        )
      )
    },
  })
  const bulkPublishMutation = useMutation({
    mutationFn: publishLatestOfficialPriceDrafts,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-prices'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'model-price-overview'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-price-overview'],
      })
      if (response.data.published > 0) {
        toast.success(
          t('Published latest official price drafts for {{count}} models', {
            count: response.data.published,
          })
        )
      } else if (response.data.skipped_unsupported === 0) {
        toast.info(t('No official price drafts to publish'))
      }
      if (response.data.skipped_unsupported > 0) {
        toast.warning(
          t(
            '{{count}} drafts were skipped because their billing modes are not enabled for runtime publishing.',
            { count: response.data.skipped_unsupported }
          )
        )
      }
    },
  })
  const totalDraftCount = rows.reduce(
    (total, row) => total + row.draft_count,
    0
  )

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Official Pricing')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button variant='outline' render={<a href='/pricing-admin' />}>
          <BarChart3 data-icon='inline-start' />
          {t('Channel Price Comparison')}
        </Button>
        <Button
          disabled={totalDraftCount === 0 || bulkPublishMutation.isPending}
          onClick={() => setBulkPublishOpen(true)}
        >
          <CheckCheck data-icon='inline-start' />
          {t('Publish Latest')}
        </Button>
        <Button
          variant='outline'
          disabled={importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          <DatabaseZap data-icon='inline-start' />
          {t('Import Legacy Pricing')}
        </Button>
        <ConfirmDialog
          open={bulkPublishOpen}
          onOpenChange={setBulkPublishOpen}
          title={t('Publish latest drafts?')}
          desc={t(
            'The latest draft for each model will be validated and published atomically.'
          )}
          confirmText={t('Publish Latest')}
          isLoading={bulkPublishMutation.isPending}
          handleConfirm={() => {
            bulkPublishMutation.mutate()
            setBulkPublishOpen(false)
          }}
        />
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        {selectedModel ? (
          <div className='flex h-full min-h-0 flex-col gap-4 overflow-hidden'>
            <div className='flex shrink-0 items-center gap-3'>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setSelectedModelId(null)}
              >
                <ArrowLeft data-icon='inline-start' />
                {t('Back')}
              </Button>
              <div className='min-w-0'>
                <h3 className='truncate font-semibold'>
                  {t('Version Details')}
                </h3>
                <p className='text-muted-foreground truncate text-sm'>
                  {selectedModel.model_name}
                </p>
              </div>
            </div>
            <div className='bg-background/95 min-h-0 flex-1 overflow-auto rounded-xl border p-4 shadow-sm backdrop-blur-sm'>
              <OfficialPricePanel
                modelId={selectedModel.model_id}
                versions={officialQuery.data?.data ?? []}
                isPublishing={publishMutation.isPending}
                isDeleting={deleteMutation.isPending}
                onPublish={(id) => publishMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onCreated={async () => {
                  await officialQuery.refetch()
                  await overviewQuery.refetch()
                }}
              />
            </div>
          </div>
        ) : (
          <div className='h-full space-y-4 overflow-auto'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Official prices are shared by all channels that reference the same logical model.'
              )}
            </p>
            <Field className='max-w-md'>
              <FieldLabel htmlFor='official-pricing-search' className='sr-only'>
                {t('Search models')}
              </FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <Search aria-hidden='true' />
                </InputGroupAddon>
                <InputGroupInput
                  id='official-pricing-search'
                  value={keyword}
                  placeholder={t('Search models')}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </InputGroup>
            </Field>
            <OfficialPriceOverviewTable
              allRows={rows}
              rows={filteredRows}
              isLoading={overviewQuery.isLoading}
              isDeleting={deleteMutation.isPending}
              isPublishing={publishMutation.isPending}
              onManage={setSelectedModelId}
              onDeleteDraft={(id) => deleteMutation.mutate(id)}
              onPublishDraft={(id) => publishMutation.mutate(id)}
            />
          </div>
        )}
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
