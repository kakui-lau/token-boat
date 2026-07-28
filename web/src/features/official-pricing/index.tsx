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
import { DatabaseZap, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  deletePriceDraft,
  getOfficialPriceVersions,
  getPricingCatalogOptions,
  importLegacyOfficialPrices,
  publishPriceVersion,
  suspendPriceVersion,
} from '@/features/pricing-admin/api'
import { OfficialPricePanel } from '@/features/pricing-admin/components/official-price-panel'

type OfficialPricingProps = {
  initialModelId?: number
}

const emptyPricingModels: { id: number; name: string }[] = []

export function OfficialPricing(props: OfficialPricingProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<number | null>(
    props.initialModelId ?? null
  )
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase())
  const catalogQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options'],
    queryFn: getPricingCatalogOptions,
  })
  const models = catalogQuery.data?.data.models ?? emptyPricingModels
  const filteredModels = deferredKeyword
    ? models.filter((model) =>
        model.name.toLowerCase().includes(deferredKeyword)
      )
    : models
  const selectedModel =
    models.find((model) => model.id === selectedModelId) ?? null
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
      toast.success(t('Price version published'))
    },
  })
  const suspendMutation = useMutation({
    mutationFn: (id: number) => suspendPriceVersion('official', id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: officialQueryKey })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'model-price-overview'],
      })
      toast.success(t('Price version suspended'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePriceDraft('official', id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: officialQueryKey })
      toast.success(t('Price draft deleted'))
    },
  })
  const importMutation = useMutation({
    mutationFn: importLegacyOfficialPrices,
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'official-prices'],
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

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Official Model Prices')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          disabled={importMutation.isPending}
          onClick={() => importMutation.mutate()}
        >
          <DatabaseZap data-icon='inline-start' />
          {t('Import Legacy Prices as Drafts')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
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
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Model')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className='font-medium'>{model.name}</TableCell>
                    <TableCell className='text-right'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setSelectedModelId(model.id)}
                      >
                        {t('Manage Official Price')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!catalogQuery.isLoading && filteredModels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className='py-8 text-center'>
                      {t('No models found')}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </SectionPageLayout.Content>

      <Sheet
        open={selectedModel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedModelId(null)
          }
        }}
      >
        <SheetContent className='w-full sm:w-[92vw] sm:max-w-5xl'>
          <SheetHeader>
            <SheetTitle>{t('Manage Official Price')}</SheetTitle>
            <SheetDescription>{selectedModel?.name ?? ''}</SheetDescription>
          </SheetHeader>
          {selectedModel ? (
            <div className='min-h-0 flex-1 overflow-auto px-4 pb-4'>
              <OfficialPricePanel
                modelId={selectedModel.id}
                versions={officialQuery.data?.data ?? []}
                isPublishing={publishMutation.isPending}
                isSuspending={suspendMutation.isPending}
                isDeleting={deleteMutation.isPending}
                onPublish={(id) => publishMutation.mutate(id)}
                onSuspend={(id) => suspendMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onCreated={async () => {
                  await officialQuery.refetch()
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </SectionPageLayout>
  )
}
