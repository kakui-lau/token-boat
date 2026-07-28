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
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  deletePriceDraft,
  getOfficialPriceVersions,
  getPurchasePriceVersions,
  getRetailPriceVersions,
  publishPriceVersion,
  suspendPriceVersion,
} from '../api'
import type { ChannelModel } from '../types'
import { ActivePriceBundlePanel } from './active-price-bundle-panel'
import { PriceSimulationPanel } from './price-simulation-panel'
import { PurchasePricePanel } from './purchase-price-panel'
import { RetailPricePanel } from './retail-price-panel'

type PriceKind = 'purchase' | 'retail'

type PriceEditorSheetProps = {
  channelModel: ChannelModel | null
  onOpenChange: (open: boolean) => void
}

export function PriceEditorSheet(props: PriceEditorSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channelModel = props.channelModel
  const officialQueryKey = [
    'pricing-admin',
    'official-prices',
    channelModel?.model_id,
  ]
  const purchaseQueryKey = [
    'pricing-admin',
    'purchase-prices',
    channelModel?.id,
  ]
  const retailQueryKey = ['pricing-admin', 'retail-prices', channelModel?.id]
  const officialQuery = useQuery({
    queryKey: officialQueryKey,
    queryFn: () => getOfficialPriceVersions(channelModel?.model_id ?? 0),
    enabled: Boolean(channelModel),
  })
  const purchaseQuery = useQuery({
    queryKey: purchaseQueryKey,
    queryFn: () => getPurchasePriceVersions(channelModel?.id ?? 0),
    enabled: Boolean(channelModel),
  })
  const retailQuery = useQuery({
    queryKey: retailQueryKey,
    queryFn: () => getRetailPriceVersions(channelModel?.id ?? 0),
    enabled: Boolean(channelModel),
  })
  const publishMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: PriceKind; id: number }) =>
      publishPriceVersion(kind, id),
    onSuccess: async (_, variables) => {
      const queryKeys: Record<PriceKind, (number | string | undefined)[]> = {
        purchase: purchaseQueryKey,
        retail: retailQueryKey,
      }
      const queryKey = queryKeys[variables.kind]
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'model-price-overview'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'active-price-bundle', channelModel?.id],
      })
      toast.success(t('Price version published'))
    },
  })
  const suspendMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: PriceKind; id: number }) =>
      suspendPriceVersion(kind, id),
    onSuccess: async (_, variables) => {
      const queryKeys: Record<PriceKind, (number | string | undefined)[]> = {
        purchase: purchaseQueryKey,
        retail: retailQueryKey,
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys[variables.kind],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'model-price-overview'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'active-price-bundle', channelModel?.id],
      })
      toast.success(t('Price version suspended'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: PriceKind; id: number }) =>
      deletePriceDraft(kind, id),
    onSuccess: async (_, variables) => {
      const queryKeys: Record<PriceKind, (number | string | undefined)[]> = {
        purchase: purchaseQueryKey,
        retail: retailQueryKey,
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys[variables.kind],
      })
      toast.success(t('Price draft deleted'))
    },
  })

  return (
    <Sheet open={Boolean(channelModel)} onOpenChange={props.onOpenChange}>
      <SheetContent className='w-full sm:w-[92vw] sm:max-w-6xl'>
        <SheetHeader>
          <SheetTitle>{t('Pricing Configuration')}</SheetTitle>
          <SheetDescription>
            {channelModel
              ? `${channelModel.channel_name} · ${channelModel.model_name}`
              : ''}
          </SheetDescription>
          {channelModel ? (
            <Button
              variant='outline'
              size='sm'
              className='mt-3 w-fit'
              render={
                <Link
                  to='/official-pricing'
                  search={{ modelId: channelModel.model_id }}
                />
              }
            >
              {t('Official Pricing')}
            </Button>
          ) : null}
        </SheetHeader>
        {channelModel ? (
          <div className='min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4'>
            <ActivePriceBundlePanel channelModelId={channelModel.id} />
            <Tabs defaultValue='purchase' className='min-h-0'>
              <TabsList className='grid h-auto w-full grid-cols-3'>
                <TabsTrigger value='purchase'>{t('Purchase')}</TabsTrigger>
                <TabsTrigger value='retail'>{t('Retail')}</TabsTrigger>
                <TabsTrigger value='simulation'>{t('Simulation')}</TabsTrigger>
              </TabsList>
              <TabsContent value='purchase'>
                <PurchasePricePanel
                  channelModelId={channelModel.id}
                  officialVersions={officialQuery.data?.data ?? []}
                  versions={purchaseQuery.data?.data ?? []}
                  isPublishing={publishMutation.isPending}
                  isSuspending={suspendMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                  onPublish={(id) =>
                    publishMutation.mutate({ kind: 'purchase', id })
                  }
                  onSuspend={(id) =>
                    suspendMutation.mutate({ kind: 'purchase', id })
                  }
                  onDelete={(id) =>
                    deleteMutation.mutate({ kind: 'purchase', id })
                  }
                  onCreated={async () => {
                    await purchaseQuery.refetch()
                  }}
                />
              </TabsContent>
              <TabsContent value='retail'>
                <RetailPricePanel
                  channelModelId={channelModel.id}
                  purchaseVersions={purchaseQuery.data?.data ?? []}
                  versions={retailQuery.data?.data ?? []}
                  isPublishing={publishMutation.isPending}
                  isSuspending={suspendMutation.isPending}
                  isDeleting={deleteMutation.isPending}
                  onPublish={(id) =>
                    publishMutation.mutate({ kind: 'retail', id })
                  }
                  onSuspend={(id) =>
                    suspendMutation.mutate({ kind: 'retail', id })
                  }
                  onDelete={(id) =>
                    deleteMutation.mutate({ kind: 'retail', id })
                  }
                  onCreated={async () => {
                    await retailQuery.refetch()
                  }}
                />
              </TabsContent>
              <TabsContent value='simulation'>
                <PriceSimulationPanel
                  channelModelId={channelModel.id}
                  purchaseVersions={purchaseQuery.data?.data ?? []}
                  retailVersions={retailQuery.data?.data ?? []}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
