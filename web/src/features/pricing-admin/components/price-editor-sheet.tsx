/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
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

import {
  deletePriceDraft,
  getOfficialPriceVersions,
  getPurchasePriceSuspendImpact,
  getPurchasePriceVersions,
  publishPriceVersion,
  suspendPriceVersion,
} from '../api'
import type { ChannelModel } from '../types'
import { PurchasePricePanel } from './purchase-price-panel'

type PriceEditorSheetProps = {
  channelModel: ChannelModel | null
  onOpenChange: (open: boolean) => void
  canWrite?: boolean
  canPublish?: boolean
}

export function PriceEditorSheet(props: PriceEditorSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channelModel = props.channelModel
  const purchaseQueryKey = [
    'pricing-admin',
    'purchase-prices',
    channelModel?.id,
  ]
  const officialQuery = useQuery({
    queryKey: ['pricing-admin', 'official-prices', channelModel?.model_id],
    queryFn: () => getOfficialPriceVersions(channelModel?.model_id ?? 0),
    enabled: Boolean(channelModel),
  })
  const purchaseQuery = useQuery({
    queryKey: purchaseQueryKey,
    queryFn: () => getPurchasePriceVersions(channelModel?.id ?? 0),
    enabled: Boolean(channelModel),
  })
  const refreshPurchaseData = async () => {
    await queryClient.invalidateQueries({ queryKey: purchaseQueryKey })
    await queryClient.invalidateQueries({
      queryKey: ['pricing-admin', 'channel-models'],
    })
  }
  const publishMutation = useMutation({
    mutationFn: (id: number) => publishPriceVersion('purchase', id),
    onSuccess: async (response) => {
      await refreshPurchaseData()
      toast.success(
        t('Price version published; {{count}} sales price drafts generated', {
          count: response.data.length,
        })
      )
    },
  })
  const suspendMutation = useMutation({
    mutationFn: async (id: number) => {
      const impact = await getPurchasePriceSuspendImpact(id)
      return suspendPriceVersion(
        'purchase',
        id,
        impact.data.remaining_candidate_count === 0
      )
    },
    onSuccess: async () => {
      await refreshPurchaseData()
      toast.success(t('Price version suspended'))
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePriceDraft('purchase', id),
    onSuccess: async () => {
      await refreshPurchaseData()
      toast.success(t('Price draft deleted'))
    },
  })

  return (
    <Sheet open={Boolean(channelModel)} onOpenChange={props.onOpenChange}>
      <SheetContent className='w-full sm:w-[92vw] sm:max-w-6xl'>
        <SheetHeader>
          <SheetTitle>{t('Purchase Pricing Configuration')}</SheetTitle>
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
          <div className='min-h-0 flex-1 overflow-auto px-4 pb-4'>
            <PurchasePricePanel
              channelModelId={channelModel.id}
              officialVersions={officialQuery.data?.data ?? []}
              versions={purchaseQuery.data?.data ?? []}
              isPublishing={publishMutation.isPending}
              isSuspending={suspendMutation.isPending}
              isDeleting={deleteMutation.isPending}
              onPublish={(id) => publishMutation.mutate(id)}
              onSuspend={(id) => suspendMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onCreated={async () => {
                await purchaseQuery.refetch()
              }}
              canWrite={props.canWrite}
              canPublish={props.canPublish}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
