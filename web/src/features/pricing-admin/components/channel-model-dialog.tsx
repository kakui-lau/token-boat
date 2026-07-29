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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  createChannelModel,
  getPricingCatalogOptions,
  updateChannelModel,
} from '../api'
import type { ChannelModel } from '../types'

type ChannelModelDialogProps = {
  open: boolean
  channelModel?: ChannelModel | null
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void>
}

export function ChannelModelDialog(props: ChannelModelDialogProps) {
  const { t } = useTranslation()
  const [channelId, setChannelId] = useState('')
  const [modelId, setModelId] = useState('')
  const [upstreamModelName, setUpstreamModelName] = useState('')
  const [status, setStatus] = useState('1')
  const [priority, setPriority] = useState('0')
  const [weight, setWeight] = useState('0')
  const [region, setRegion] = useState('')
  useEffect(() => {
    if (!props.open) {
      return
    }
    setChannelId(
      props.channelModel ? String(props.channelModel.channel_id) : ''
    )
    setModelId(props.channelModel ? String(props.channelModel.model_id) : '')
    setUpstreamModelName(props.channelModel?.upstream_model_name ?? '')
    setStatus(String(props.channelModel?.status ?? 1))
    setPriority(String(props.channelModel?.priority ?? 0))
    setWeight(String(props.channelModel?.weight ?? 0))
    setRegion(props.channelModel?.region ?? '')
  }, [props.channelModel, props.open])
  const channelsQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options', 'channels'],
    queryFn: () => getPricingCatalogOptions(),
    enabled: props.open,
  })
  const modelsQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options', 'models', channelId],
    queryFn: () => getPricingCatalogOptions(Number(channelId)),
    enabled: props.open && Boolean(channelId),
  })
  const mutation = useMutation({
    mutationFn: () =>
      props.channelModel
        ? updateChannelModel(props.channelModel.id, {
            channel_id: Number(channelId),
            model_id: Number(modelId),
            upstream_model_name: upstreamModelName.trim(),
            status: Number(status),
            priority: Number(priority),
            weight: Number(weight),
            region: region.trim(),
          })
        : createChannelModel({
            channel_id: Number(channelId),
            model_id: Number(modelId),
            upstream_model_name: upstreamModelName.trim(),
            status: Number(status),
            priority: Number(priority),
            weight: Number(weight),
            region: region.trim(),
          }),
    onSuccess: async () => {
      await props.onCreated()
      props.onOpenChange(false)
      toast.success(
        props.channelModel
          ? t('Channel model updated')
          : t('Channel model created')
      )
    },
  })
  const canSubmit =
    Number(channelId) > 0 &&
    Number(modelId) > 0 &&
    upstreamModelName.trim() !== '' &&
    Number.isInteger(Number(priority)) &&
    Number.isInteger(Number(weight)) &&
    Number(weight) >= 0

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {props.channelModel
              ? t('Edit Channel Model')
              : t('Add Channel Model')}
          </DialogTitle>
          <DialogDescription>
            {props.channelModel
              ? t(
                  'Channel, logical model, and upstream model name are immutable after creation.'
                )
              : t(
                  'Bind one logical model to the upstream model name exposed by a channel.'
                )}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='channel-model-channel'>
              {t('Channel')}
            </FieldLabel>
            <NativeSelect
              id='channel-model-channel'
              className='w-full'
              value={channelId}
              disabled={Boolean(props.channelModel)}
              onChange={(event) => {
                setChannelId(event.target.value)
                setModelId('')
                setUpstreamModelName('')
              }}
            >
              <NativeSelectOption value=''>
                {t('Select a channel')}
              </NativeSelectOption>
              {channelsQuery.data?.data.channels.map((option) => (
                <NativeSelectOption key={option.id} value={String(option.id)}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor='channel-model-model'>{t('Model')}</FieldLabel>
            <NativeSelect
              id='channel-model-model'
              className='w-full'
              value={modelId}
              disabled={
                Boolean(props.channelModel) ||
                !channelId ||
                modelsQuery.isPending
              }
              onChange={(event) => {
                setModelId(event.target.value)
                const selected = modelsQuery.data?.data.models.find(
                  (option) => option.id === Number(event.target.value)
                )
                if (selected) {
                  setUpstreamModelName(
                    selected.upstream_model_name || selected.name
                  )
                }
              }}
            >
              <NativeSelectOption value=''>
                {t('Select a model')}
              </NativeSelectOption>
              {props.channelModel ? (
                <NativeSelectOption value={String(props.channelModel.model_id)}>
                  {props.channelModel.model_name}
                </NativeSelectOption>
              ) : (
                modelsQuery.data?.data.models.map((option) => (
                  <NativeSelectOption key={option.id} value={String(option.id)}>
                    {option.name}
                  </NativeSelectOption>
                ))
              )}
            </NativeSelect>
          </Field>
          <Field className='sm:col-span-2'>
            <FieldLabel htmlFor='channel-model-upstream-name'>
              {t('Provider Model')}
            </FieldLabel>
            <Input
              id='channel-model-upstream-name'
              value={upstreamModelName}
              disabled={Boolean(props.channelModel)}
              onChange={(event) => setUpstreamModelName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='channel-model-status'>
              {t('Status')}
            </FieldLabel>
            <NativeSelect
              id='channel-model-status'
              className='w-full'
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <NativeSelectOption value='1'>{t('Enabled')}</NativeSelectOption>
              <NativeSelectOption value='0'>{t('Disabled')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor='channel-model-region'>
              {t('Region')}
            </FieldLabel>
            <Input
              id='channel-model-region'
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='channel-model-priority'>
              {t('Priority')}
            </FieldLabel>
            <Input
              id='channel-model-priority'
              type='number'
              step={1}
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='channel-model-weight'>
              {t('Weight')}
            </FieldLabel>
            <Input
              id='channel-model-weight'
              type='number'
              min={0}
              step={1}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {props.channelModel ? t('Save') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
