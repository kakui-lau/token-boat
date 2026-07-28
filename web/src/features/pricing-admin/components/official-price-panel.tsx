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
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import {
  createOfficialFlatDraft,
  createOfficialPriceDraft,
  updateOfficialFlatDraft,
  updateOfficialPriceDraft,
} from '../api'
import { officialPriceSchema, type OfficialPriceForm } from '../lib/schemas'
import type { FlatTokenPrices, OfficialPriceVersion } from '../types'
import { OfficialPriceVersionDialog } from './official-price-version-dialog'
import { PriceInputField } from './price-input-field'
import { VersionList } from './version-list'

type OfficialPricePanelProps = {
  modelId: number
  versions: OfficialPriceVersion[]
  isPublishing: boolean
  isDeleting: boolean
  onPublish: (id: number) => void
  onDelete: (id: number) => void
  onCreated: () => Promise<void>
}

export function OfficialPricePanel(props: OfficialPricePanelProps) {
  const { t } = useTranslation()
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null)
  const [selectedVersion, setSelectedVersion] =
    useState<OfficialPriceVersion | null>(null)
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  const [configurationDraft, setConfigurationDraft] =
    useState<OfficialPriceVersion | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
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
      setBaseVersion(null)
      form.reset(defaultValues)
      await props.onCreated()
      toast.success(
        wasEditing
          ? t('Official price draft updated')
          : t('Official price draft created')
      )
    },
  })
  const configurationSaveMutation = useMutation({
    mutationFn: (version: OfficialPriceVersion) => {
      const input = {
        model_id: props.modelId,
        billing_mode: version.billing_mode,
        price_structure: version.price_structure,
        price_components: version.price_components,
        billing_expr: version.billing_expr,
        expression_source: version.expression_source || 'custom',
        expression_schema_version: version.expression_schema_version || 'v1',
        currency: version.currency,
        source: editingDraftId === null ? 'manual' : version.source,
        source_version:
          editingDraftId === null ? undefined : version.source_version,
        remark: version.remark,
      }
      if (editingDraftId !== null) {
        return updateOfficialPriceDraft(editingDraftId, input)
      }
      return createOfficialPriceDraft(input)
    },
    onSuccess: async () => {
      const wasEditing = editingDraftId !== null
      setEditingDraftId(null)
      setBaseVersion(null)
      setConfigurationDraft(null)
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
    if (
      version.billing_mode !== 'token' ||
      version.price_structure !== 'flat'
    ) {
      setConfigurationDraft({ ...version })
      setEditingDraftId(edit ? version.id : null)
      setBaseVersion(version.version)
      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      toast.success(
        edit
          ? t('Draft loaded for editing')
          : t('Historical version copied into the new draft')
      )
      return
    }
    setConfigurationDraft(null)
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
    setBaseVersion(version.version)
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    toast.success(
      edit
        ? t('Draft loaded for editing')
        : t('Historical version copied into the new draft')
    )
  }

  return (
    <div className='space-y-6'>
      {configurationDraft ? (
        <form
          key='configuration-editor'
          ref={formRef}
          className='pricing-form-surface space-y-4 rounded-xl border p-4 sm:p-5'
          onSubmit={(event) => {
            event.preventDefault()
            try {
              JSON.parse(configurationDraft.price_components)
            } catch {
              toast.error(
                t('Unable to read price components from this version')
              )
              return
            }
            configurationSaveMutation.mutate(configurationDraft)
          }}
        >
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <h3 className='font-medium'>
              {editingDraftId === null
                ? t('New Official Version')
                : t('Edit Official Version')}
            </h3>
            <span className='text-muted-foreground text-xs'>
              {t('Based on Version {{version}}', { version: baseVersion })}
            </span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                setEditingDraftId(null)
                setBaseVersion(null)
                setConfigurationDraft(null)
              }}
            >
              {t('Cancel')}
            </Button>
          </div>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='official-config-billing-mode'>
                {t('Billing Mode')}
              </FieldLabel>
              <Input
                id='official-config-billing-mode'
                value={configurationDraft.billing_mode}
                disabled
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='official-config-price-structure'>
                {t('Price Structure')}
              </FieldLabel>
              <Input
                id='official-config-price-structure'
                value={configurationDraft.price_structure}
                disabled
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='official-config-currency'>
                {t('Currency')}
              </FieldLabel>
              <Input
                id='official-config-currency'
                value={configurationDraft.currency}
                maxLength={8}
                onChange={(event) =>
                  setConfigurationDraft({
                    ...configurationDraft,
                    currency: event.target.value,
                  })
                }
              />
            </Field>
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor='official-config-components'>
              {t('Price Components')}
            </FieldLabel>
            <Textarea
              id='official-config-components'
              className='min-h-36 font-mono text-xs'
              value={configurationDraft.price_components}
              onChange={(event) =>
                setConfigurationDraft({
                  ...configurationDraft,
                  price_components: event.target.value,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='official-config-expression'>
              {t('Billing Expression')}
            </FieldLabel>
            <Textarea
              id='official-config-expression'
              className='min-h-36 font-mono text-xs'
              value={configurationDraft.billing_expr}
              onChange={(event) =>
                setConfigurationDraft({
                  ...configurationDraft,
                  billing_expr: event.target.value,
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='official-config-remark'>
              {t('Remark')}
            </FieldLabel>
            <Textarea
              id='official-config-remark'
              value={configurationDraft.remark}
              onChange={(event) =>
                setConfigurationDraft({
                  ...configurationDraft,
                  remark: event.target.value,
                })
              }
            />
          </Field>
          <Button type='submit' disabled={configurationSaveMutation.isPending}>
            {editingDraftId === null ? t('Save Draft') : t('Save Changes')}
          </Button>
        </form>
      ) : (
        <form
          key='flat-token-editor'
          ref={formRef}
          className='pricing-form-surface space-y-4 rounded-xl border p-4 sm:p-5'
          onSubmit={form.handleSubmit((value) => saveMutation.mutate(value))}
        >
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <h3 className='font-medium'>
              {editingDraftId === null
                ? t('New Official Version')
                : t('Edit Official Version')}
            </h3>
            {baseVersion !== null ? (
              <span className='text-muted-foreground text-xs'>
                {t('Based on Version {{version}}', { version: baseVersion })}
              </span>
            ) : null}
            {editingDraftId !== null ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  setEditingDraftId(null)
                  setBaseVersion(null)
                  form.reset(defaultValues)
                }}
              >
                {t('Cancel')}
              </Button>
            ) : null}
          </div>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='official-currency'>
                {t('Currency')}
              </FieldLabel>
              <Input
                id='official-currency'
                maxLength={8}
                {...form.register('currency')}
              />
            </Field>
            <PriceInputField
              id='official-input-price'
              label='Input / 1M tokens'
              registration={form.register('input_unit_price')}
              error={form.formState.errors.input_unit_price}
            />
            <PriceInputField
              id='official-output-price'
              label='Output / 1M tokens'
              registration={form.register('output_unit_price')}
              error={form.formState.errors.output_unit_price}
            />
            <PriceInputField
              id='official-cache-read-price'
              label='Cache Read / 1M tokens'
              registration={form.register('cache_read_unit_price')}
              error={form.formState.errors.cache_read_unit_price}
            />
            <PriceInputField
              id='official-cache-write-price'
              label='Cache Write / 1M tokens'
              registration={form.register('cache_write_unit_price')}
              error={form.formState.errors.cache_write_unit_price}
            />
            <PriceInputField
              id='official-image-input-price'
              label='Image Input / 1M tokens'
              registration={form.register('image_input_unit_price')}
              error={form.formState.errors.image_input_unit_price}
            />
            <PriceInputField
              id='official-image-output-price'
              label='Image Output / 1M tokens'
              registration={form.register('image_output_unit_price')}
              error={form.formState.errors.image_output_unit_price}
            />
            <PriceInputField
              id='official-audio-input-price'
              label='Audio Input / 1M tokens'
              registration={form.register('audio_input_unit_price')}
              error={form.formState.errors.audio_input_unit_price}
            />
            <PriceInputField
              id='official-audio-output-price'
              label='Audio Output / 1M tokens'
              registration={form.register('audio_output_unit_price')}
              error={form.formState.errors.audio_output_unit_price}
            />
          </FieldGroup>
          <Field>
            <FieldLabel htmlFor='official-remark'>{t('Remark')}</FieldLabel>
            <Textarea id='official-remark' {...form.register('remark')} />
          </Field>
          <Button type='submit' disabled={saveMutation.isPending}>
            {editingDraftId === null ? t('Save Draft') : t('Save Changes')}
          </Button>
        </form>
      )}

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Version History')}</h3>
        <VersionList
          items={props.versions}
          isPublishing={props.isPublishing}
          isSuspending={false}
          isDeleting={props.isDeleting}
          onPublish={props.onPublish}
          onSuspend={() => undefined}
          onDelete={props.onDelete}
          allowSuspend={false}
          onView={(id) =>
            setSelectedVersion(
              props.versions.find((item) => item.id === id) ?? null
            )
          }
          onEdit={(id) => fillFromVersion(id, true)}
          onFill={(id) => fillFromVersion(id, false)}
        />
      </section>
      <OfficialPriceVersionDialog
        version={selectedVersion}
        onOpenChange={(open) => {
          if (!open) setSelectedVersion(null)
        }}
      />
    </div>
  )
}
