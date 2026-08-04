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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  createOfficialFlatDraft,
  createOfficialPriceDraft,
  updateOfficialFlatDraft,
  updateOfficialPriceDraft,
} from '../api'
import { officialPriceSchema, type OfficialPriceForm } from '../lib/schemas'
import type { FlatTokenPrices, OfficialPriceVersion } from '../types'
import { OfficialPriceConfigurationEditor } from './official-price-configuration-editor'
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
  canWrite?: boolean
  canPublish?: boolean
}

const billingModeOptions = [
  { value: 'token', label: 'Token' },
  { value: 'request', label: 'Per request' },
  { value: 'image', label: 'Image' },
  { value: 'audio_duration', label: 'Audio duration' },
  { value: 'video_duration', label: 'Video duration' },
  { value: 'character', label: 'Character' },
  { value: 'mixed', label: 'Mixed' },
]

const priceStructureOptions = [
  { value: 'flat', label: 'Flat rate' },
  { value: 'tiered', label: 'Tiered pricing' },
  { value: 'expression', label: 'Conditional pricing' },
]

const priceStructureDescriptions: Record<string, string> = {
  flat: 'Use one unit price for all usage. This is the recommended choice for most models.',
  tiered:
    'Use only when the provider changes the unit price after a usage or context threshold.',
  expression:
    'Use when request options such as resolution, quality, operation, or audio change the price.',
}

function emptyOfficialConfiguration(
  modelId: number,
  billingMode: string,
  priceStructure: string
): OfficialPriceVersion {
  let billingExpression = ''
  if (billingMode === 'token' && priceStructure !== 'flat') {
    billingExpression = 'v2:(tier("base", p * 0 + c * 0)) / 1000000'
  } else if (billingMode !== 'token') {
    const usageVariables: Record<string, string> = {
      request: 'req',
      image: 'images',
      audio_duration: 'audio_s',
      video_duration: 'video_s',
      character: 'chars / 1000000',
      mixed: 'req',
    }
    billingExpression = `v2:tier("base", ${usageVariables[billingMode] ?? 'req'} * 0)`
  }
  return {
    id: 0,
    model_id: modelId,
    billing_mode: billingMode,
    price_structure: priceStructure,
    price_components: '{}',
    billing_expr: billingExpression,
    expression_source: 'custom',
    expression_schema_version: 'v2',
    currency: 'USD',
    version: 0,
    status: 'draft',
    source: 'manual',
    remark: '',
    effective_from: 0,
    effective_to: 0,
  }
}

export function OfficialPricePanel(props: OfficialPricePanelProps) {
  const { t } = useTranslation()
  const localizedBillingModeOptions = billingModeOptions.map((option) => ({
    ...option,
    label: t(option.label),
  }))
  const localizedPriceStructureOptions = priceStructureOptions.map(
    (option) => ({
      ...option,
      label: t(option.label),
    })
  )
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null)
  const [selectedVersion, setSelectedVersion] =
    useState<OfficialPriceVersion | null>(null)
  const [baseVersion, setBaseVersion] = useState<number | null>(null)
  const [configurationDraft, setConfigurationDraft] =
    useState<OfficialPriceVersion | null>(null)
  const [newBillingMode, setNewBillingMode] = useState('token')
  const [newPriceStructure, setNewPriceStructure] = useState('flat')
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
        expression_schema_version: version.expression_schema_version || 'v2',
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
      setNewBillingMode('token')
      setNewPriceStructure('flat')
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
      setConfigurationDraft({ ...version, currency: 'USD' })
      setNewBillingMode(version.billing_mode)
      setNewPriceStructure(version.price_structure)
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
    setNewBillingMode(version.billing_mode)
    setNewPriceStructure(version.price_structure)
    let prices: Partial<FlatTokenPrices> = {}
    try {
      prices = JSON.parse(version.price_components) as Partial<FlatTokenPrices>
    } catch {
      toast.error(t('Unable to read price components from this version'))
      return
    }
    form.reset({
      currency: 'USD',
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
      {props.canWrite !== false &&
      editingDraftId === null &&
      baseVersion === null ? (
        <section className='pricing-form-surface space-y-4 rounded-xl border p-4 sm:p-5'>
          <div>
            <h3 className='font-medium'>{t('Price Configuration')}</h3>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Choose how this model is metered and how its official price is organized.'
              )}
            </p>
          </div>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <Field>
              <FieldLabel htmlFor='new-official-billing-mode'>
                {t('Billing Mode')}
              </FieldLabel>
              <Select
                items={localizedBillingModeOptions}
                value={newBillingMode}
                onValueChange={(value) => {
                  if (!value) return
                  setNewBillingMode(value)
                  if (value === 'token' && newPriceStructure === 'flat') {
                    setConfigurationDraft(null)
                    return
                  }
                  setConfigurationDraft(
                    emptyOfficialConfiguration(
                      props.modelId,
                      value,
                      newPriceStructure
                    )
                  )
                }}
              >
                <SelectTrigger
                  id='new-official-billing-mode'
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {billingModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Billing mode defines what usage is measured, such as tokens, requests, images, audio duration, or video duration.'
                )}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor='new-official-price-structure'>
                {t('Price Structure')}
              </FieldLabel>
              <Select
                items={localizedPriceStructureOptions}
                value={newPriceStructure}
                onValueChange={(value) => {
                  if (!value) return
                  setNewPriceStructure(value)
                  if (newBillingMode === 'token' && value === 'flat') {
                    setConfigurationDraft(null)
                    return
                  }
                  setConfigurationDraft(
                    emptyOfficialConfiguration(
                      props.modelId,
                      newBillingMode,
                      value
                    )
                  )
                }}
              >
                <SelectTrigger
                  id='new-official-price-structure'
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {priceStructureOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.label)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className='text-muted-foreground text-xs'>
                {t(priceStructureDescriptions[newPriceStructure])}
              </p>
            </Field>
          </FieldGroup>
        </section>
      ) : null}
      {configurationDraft ? (
        <form
          key='configuration-editor'
          ref={formRef}
          hidden={props.canWrite === false}
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
                setNewBillingMode('token')
                setNewPriceStructure('flat')
              }}
            >
              {t('Cancel')}
            </Button>
          </div>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            {baseVersion !== null || editingDraftId !== null ? (
              <>
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
              </>
            ) : null}
            <Field>
              <FieldLabel htmlFor='official-config-currency'>
                {t('Currency')}
              </FieldLabel>
              <Input
                id='official-config-currency'
                value={configurationDraft.currency}
                disabled
              />
            </Field>
          </FieldGroup>
          <OfficialPriceConfigurationEditor
            version={configurationDraft}
            onChange={setConfigurationDraft}
          />
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
          hidden={props.canWrite === false}
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
                disabled
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
          showId
          onView={(id) =>
            setSelectedVersion(
              props.versions.find((item) => item.id === id) ?? null
            )
          }
          onEdit={(id) => fillFromVersion(id, true)}
          onFill={(id) => fillFromVersion(id, false)}
          canWrite={props.canWrite}
          canPublish={props.canPublish}
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
