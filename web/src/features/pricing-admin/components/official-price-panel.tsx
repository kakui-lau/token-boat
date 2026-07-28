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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { createOfficialFlatDraft, updateOfficialFlatDraft } from '../api'
import { officialPriceSchema, type OfficialPriceForm } from '../lib/schemas'
import type { FlatTokenPrices, OfficialPriceVersion } from '../types'
import { PriceInputField } from './price-input-field'
import { VersionList } from './version-list'

type OfficialPricePanelProps = {
  modelId: number
  versions: OfficialPriceVersion[]
  isPublishing: boolean
  isSuspending: boolean
  isDeleting: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
  onDelete: (id: number) => void
  onCreated: () => Promise<void>
}

export function OfficialPricePanel(props: OfficialPricePanelProps) {
  const { t } = useTranslation()
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null)
  const defaultValues: OfficialPriceForm = {
    currency: 'USD',
    input_unit_price: '',
    output_unit_price: '',
    cache_read_unit_price: '',
    cache_write_unit_price: '',
    image_input_unit_price: '',
    image_output_unit_price: '',
    audio_input_unit_price: '',
    audio_output_unit_price: '',
    remark: '',
  }
  const form = useForm<OfficialPriceForm>({
    resolver: zodResolver(officialPriceSchema),
    defaultValues,
  })
  const saveMutation = useMutation({
    mutationFn: (value: OfficialPriceForm) => {
      const input = {
        model_id: props.modelId,
        currency: value.currency,
        prices: {
          input_unit_price: value.input_unit_price,
          output_unit_price: value.output_unit_price,
          cache_read_unit_price: value.cache_read_unit_price,
          cache_write_unit_price: value.cache_write_unit_price,
          image_input_unit_price: value.image_input_unit_price,
          image_output_unit_price: value.image_output_unit_price,
          audio_input_unit_price: value.audio_input_unit_price,
          audio_output_unit_price: value.audio_output_unit_price,
        },
        remark: value.remark,
      }
      if (editingDraftId !== null) {
        return updateOfficialFlatDraft(editingDraftId, input)
      }
      return createOfficialFlatDraft(input)
    },
    onSuccess: async () => {
      const wasEditing = editingDraftId !== null
      setEditingDraftId(null)
      form.reset(defaultValues)
      await props.onCreated()
      toast.success(
        wasEditing
          ? t('Official price draft updated')
          : t('Official price draft created')
      )
    },
  })

  const fillFromVersion = (versionId: number, edit: boolean) => {
    const version = props.versions.find((item) => item.id === versionId)
    if (!version) return
    let prices: Partial<FlatTokenPrices> = {}
    try {
      prices = JSON.parse(version.price_components) as Partial<FlatTokenPrices>
    } catch {
      toast.error(t('Unable to read price components from this version'))
      return
    }
    form.reset({
      currency: version.currency,
      input_unit_price: prices.input_unit_price ?? '',
      output_unit_price: prices.output_unit_price ?? '',
      cache_read_unit_price: prices.cache_read_unit_price ?? '',
      cache_write_unit_price: prices.cache_write_unit_price ?? '',
      image_input_unit_price: prices.image_input_unit_price ?? '',
      image_output_unit_price: prices.image_output_unit_price ?? '',
      audio_input_unit_price: prices.audio_input_unit_price ?? '',
      audio_output_unit_price: prices.audio_output_unit_price ?? '',
      remark: edit ? version.remark : '',
    })
    setEditingDraftId(edit ? version.id : null)
    toast.success(
      edit
        ? t('Draft loaded for editing')
        : t('Historical version copied into the new draft')
    )
  }

  return (
    <div className='space-y-6'>
      <form
        className='pricing-form-surface space-y-4 rounded-xl border p-4 sm:p-5'
        onSubmit={form.handleSubmit((value) => saveMutation.mutate(value))}
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <h3 className='font-medium'>
            {editingDraftId === null
              ? t('Create official price draft')
              : t('Edit official price draft')}
          </h3>
          {editingDraftId !== null ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setEditingDraftId(null)
                form.reset(defaultValues)
              }}
            >
              {t('Cancel Editing')}
            </Button>
          ) : null}
        </div>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='official-currency'>{t('Currency')}</FieldLabel>
            <Input
              id='official-currency'
              maxLength={8}
              {...form.register('currency')}
            />
          </Field>
          <PriceInputField
            id='official-input-price'
            label='Input price per 1M tokens'
            registration={form.register('input_unit_price')}
            error={form.formState.errors.input_unit_price}
          />
          <PriceInputField
            id='official-output-price'
            label='Output price per 1M tokens'
            registration={form.register('output_unit_price')}
            error={form.formState.errors.output_unit_price}
          />
          <PriceInputField
            id='official-cache-read-price'
            label='Cache read price per 1M tokens'
            registration={form.register('cache_read_unit_price')}
            error={form.formState.errors.cache_read_unit_price}
          />
          <PriceInputField
            id='official-cache-write-price'
            label='Cache write price per 1M tokens'
            registration={form.register('cache_write_unit_price')}
            error={form.formState.errors.cache_write_unit_price}
          />
          <PriceInputField
            id='official-image-input-price'
            label='Image input price per 1M tokens'
            registration={form.register('image_input_unit_price')}
            error={form.formState.errors.image_input_unit_price}
          />
          <PriceInputField
            id='official-image-output-price'
            label='Image output price per 1M tokens'
            registration={form.register('image_output_unit_price')}
            error={form.formState.errors.image_output_unit_price}
          />
          <PriceInputField
            id='official-audio-input-price'
            label='Audio input price per 1M tokens'
            registration={form.register('audio_input_unit_price')}
            error={form.formState.errors.audio_input_unit_price}
          />
          <PriceInputField
            id='official-audio-output-price'
            label='Audio output price per 1M tokens'
            registration={form.register('audio_output_unit_price')}
            error={form.formState.errors.audio_output_unit_price}
          />
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor='official-remark'>{t('Remark')}</FieldLabel>
          <Textarea id='official-remark' {...form.register('remark')} />
        </Field>
        <Button type='submit' disabled={saveMutation.isPending}>
          {editingDraftId === null ? t('Save Draft') : t('Update Draft')}
        </Button>
      </form>

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Official price versions')}</h3>
        <VersionList
          items={props.versions}
          isPublishing={props.isPublishing}
          isSuspending={props.isSuspending}
          isDeleting={props.isDeleting}
          onPublish={props.onPublish}
          onSuspend={props.onSuspend}
          onDelete={props.onDelete}
          onEdit={(id) => fillFromVersion(id, true)}
          onFill={(id) => fillFromVersion(id, false)}
        />
      </section>
    </div>
  )
}
