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
import { useState } from 'react'
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

import { createChannelModel, getPricingCatalogOptions } from '../api'

type ChannelModelDialogProps = {
  open: boolean
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
  const optionsQuery = useQuery({
    queryKey: ['pricing-admin', 'catalog-options'],
    queryFn: getPricingCatalogOptions,
    enabled: props.open,
  })
  const mutation = useMutation({
    mutationFn: () =>
      createChannelModel({
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
      toast.success(t('Channel model created'))
    },
  })
  const canSubmit =
    Number(channelId) > 0 &&
    Number(modelId) > 0 &&
    upstreamModelName.trim() !== '' &&
    Number.isFinite(Number(priority)) &&
    Number(weight) >= 0

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Create Channel Model')}</DialogTitle>
          <DialogDescription>
            {t(
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
              onChange={(event) => setChannelId(event.target.value)}
            >
              <NativeSelectOption value=''>
                {t('Select a channel')}
              </NativeSelectOption>
              {optionsQuery.data?.data.channels.map((option) => (
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
              onChange={(event) => {
                setModelId(event.target.value)
                const selected = optionsQuery.data?.data.models.find(
                  (option) => option.id === Number(event.target.value)
                )
                if (selected && upstreamModelName === '') {
                  setUpstreamModelName(selected.name)
                }
              }}
            >
              <NativeSelectOption value=''>
                {t('Select a model')}
              </NativeSelectOption>
              {optionsQuery.data?.data.models.map((option) => (
                <NativeSelectOption key={option.id} value={String(option.id)}>
                  {option.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className='sm:col-span-2'>
            <FieldLabel htmlFor='channel-model-upstream-name'>
              {t('Upstream Model')}
            </FieldLabel>
            <Input
              id='channel-model-upstream-name'
              value={upstreamModelName}
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
            {t('Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
