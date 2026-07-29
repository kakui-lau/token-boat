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
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import { createPurchaseDraft, updatePurchaseDraft } from '../api'
import { purchasePriceSchema, type PurchasePriceForm } from '../lib/schemas'
import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'
import { ChannelPriceVersionDialog } from './channel-price-version-dialog'
import { PriceInputField } from './price-input-field'
import { VersionList } from './version-list'

type PurchasePricePanelProps = {
  channelModelId: number
  officialVersions: OfficialPriceVersion[]
  versions: PurchasePriceVersion[]
  isPublishing: boolean
  isSuspending: boolean
  isDeleting: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
  onDelete: (id: number) => void
  onCreated: () => Promise<void>
}

const emptyPrices = {
  input_unit_price: '',
  output_unit_price: '',
  cache_read_unit_price: '',
  cache_write_unit_price: '',
  image_input_unit_price: '',
  image_output_unit_price: '',
  audio_input_unit_price: '',
  audio_output_unit_price: '',
}

export function PurchasePricePanel(props: PurchasePricePanelProps) {
  const { t } = useTranslation()
  const [detailVersion, setDetailVersion] =
    useState<PurchasePriceVersion | null>(null)
  const [editVersionId, setEditVersionId] = useState<number | null>(null)
  const [editVersionUpdatedAt, setEditVersionUpdatedAt] = useState<
    number | undefined
  >(undefined)
  const form = useForm<PurchasePriceForm>({
    resolver: zodResolver(purchasePriceSchema),
    defaultValues: {
      pricing_mode: 'official_ratio',
      currency: 'USD',
      official_price_version_id: '',
      purchase_discount: '',
      input_discount: '',
      output_discount: '',
      cache_read_discount: '',
      cache_write_discount: '',
      image_input_discount: '',
      image_output_discount: '',
      audio_input_discount: '',
      audio_output_discount: '',
      ...emptyPrices,
      quote_reference: '',
      contract_reference: '',
      remark: '',
    },
  })
  const pricingMode = form.watch('pricing_mode')
  const eligibleOfficialVersions = useMemo(
    () =>
      props.officialVersions.filter(
        (version) =>
          (version.status === 'active' || version.status === 'expired') &&
          (pricingMode === 'official_ratio' ||
            version.price_structure === 'flat')
      ),
    [pricingMode, props.officialVersions]
  )
  const createMutation = useMutation({
    mutationFn: (value: PurchasePriceForm) => {
      const payload = {
        channel_model_id: props.channelModelId,
        official_price_version_id: value.official_price_version_id
          ? Number(value.official_price_version_id)
          : undefined,
        pricing_mode: value.pricing_mode,
        currency: value.currency,
        purchase_discount: value.purchase_discount,
        input_discount: value.input_discount,
        output_discount: value.output_discount,
        cache_read_discount: value.cache_read_discount,
        cache_write_discount: value.cache_write_discount,
        image_input_discount: value.image_input_discount,
        image_output_discount: value.image_output_discount,
        audio_input_discount: value.audio_input_discount,
        audio_output_discount: value.audio_output_discount,
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
        quote_reference: value.quote_reference,
        contract_reference: value.contract_reference,
        remark: value.remark,
        expected_updated_at: editVersionUpdatedAt,
      }
      return editVersionId
        ? updatePurchaseDraft(editVersionId, payload)
        : createPurchaseDraft(payload)
    },
    onSuccess: async () => {
      const wasEditing = editVersionId !== null
      form.reset()
      setEditVersionId(null)
      setEditVersionUpdatedAt(undefined)
      await props.onCreated()
      toast.success(
        t(
          wasEditing
            ? 'Purchase price draft updated'
            : 'Purchase price draft created'
        )
      )
    },
  })
  const editVersion = (id: number) => {
    const version = props.versions.find((item) => item.id === id)
    if (!version) {
      return
    }
    let componentPrices: Record<string, string> = {}
    let discountSpec: Record<string, string> = {}
    try {
      componentPrices = JSON.parse(version.price_components || '{}') as Record<
        string,
        string
      >
      discountSpec = JSON.parse(version.quote_spec || '{}') as Record<
        string,
        string
      >
    } catch {
      componentPrices = {}
      discountSpec = {}
    }
    const canRestoreMode =
      version.pricing_mode !== 'component_ratio' ||
      Object.keys(discountSpec).length > 0
    form.reset({
      pricing_mode: canRestoreMode
        ? (version.pricing_mode as PurchasePriceForm['pricing_mode'])
        : 'fixed_unit_price',
      currency: version.currency,
      official_price_version_id: version.official_price_version_id
        ? String(version.official_price_version_id)
        : '',
      purchase_discount: version.purchase_discount || '',
      input_discount: discountSpec.input_discount || '',
      output_discount: discountSpec.output_discount || '',
      cache_read_discount: discountSpec.cache_read_discount || '',
      cache_write_discount: discountSpec.cache_write_discount || '',
      image_input_discount: discountSpec.image_input_discount || '',
      image_output_discount: discountSpec.image_output_discount || '',
      audio_input_discount: discountSpec.audio_input_discount || '',
      audio_output_discount: discountSpec.audio_output_discount || '',
      input_unit_price: version.input_unit_price || '',
      output_unit_price: version.output_unit_price || '',
      cache_read_unit_price: version.cache_read_unit_price || '',
      cache_write_unit_price: version.cache_write_unit_price || '',
      image_input_unit_price: componentPrices.image_input_unit_price || '',
      image_output_unit_price: componentPrices.image_output_unit_price || '',
      audio_input_unit_price: componentPrices.audio_input_unit_price || '',
      audio_output_unit_price: componentPrices.audio_output_unit_price || '',
      quote_reference: version.quote_reference || '',
      contract_reference: version.contract_reference || '',
      remark: version.remark || '',
    })
    setEditVersionId(id)
    setEditVersionUpdatedAt(version.updated_at)
  }

  const fillFromVersion = (id: number) => {
    const version = props.versions.find((item) => item.id === id)
    if (!version) {
      return
    }
    let componentPrices: Record<string, string> = {}
    try {
      componentPrices = JSON.parse(version.price_components || '{}') as Record<
        string,
        string
      >
    } catch {
      componentPrices = {}
    }
    form.reset({
      pricing_mode: 'fixed_unit_price',
      currency: version.currency,
      official_price_version_id: '',
      purchase_discount: '',
      input_discount: '',
      output_discount: '',
      cache_read_discount: '',
      cache_write_discount: '',
      image_input_discount: '',
      image_output_discount: '',
      audio_input_discount: '',
      audio_output_discount: '',
      input_unit_price: version.input_unit_price || '',
      output_unit_price: version.output_unit_price || '',
      cache_read_unit_price: version.cache_read_unit_price || '',
      cache_write_unit_price: version.cache_write_unit_price || '',
      image_input_unit_price: componentPrices.image_input_unit_price || '',
      image_output_unit_price: componentPrices.image_output_unit_price || '',
      audio_input_unit_price: componentPrices.audio_input_unit_price || '',
      audio_output_unit_price: componentPrices.audio_output_unit_price || '',
      quote_reference: version.quote_reference || '',
      contract_reference: version.contract_reference || '',
      remark: '',
    })
    toast.success(t('Historical version copied into the new draft'))
  }

  return (
    <div className='space-y-6'>
      <form
        className='pricing-form-surface space-y-4 rounded-xl border p-4 sm:p-5'
        onSubmit={form.handleSubmit((value) => createMutation.mutate(value))}
      >
        <div className='flex items-center justify-between gap-3'>
          <h3 className='font-medium'>
            {t(
              editVersionId ? 'Edit Purchase Version' : 'New Purchase Version'
            )}
          </h3>
          {editVersionId ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => {
                form.reset()
                setEditVersionId(null)
                setEditVersionUpdatedAt(undefined)
              }}
            >
              {t('Cancel Editing')}
            </Button>
          ) : null}
        </div>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='purchase-pricing-mode'>
              {t('Cost Basis')}
            </FieldLabel>
            <NativeSelect
              id='purchase-pricing-mode'
              className='w-full'
              {...form.register('pricing_mode')}
            >
              <NativeSelectOption value='official_ratio'>
                {t('Official Discount')}
              </NativeSelectOption>
              <NativeSelectOption value='component_ratio'>
                {t('Component Discounts')}
              </NativeSelectOption>
              <NativeSelectOption value='fixed_unit_price'>
                {t('Fixed Prices')}
              </NativeSelectOption>
            </NativeSelect>
          </Field>
          {pricingMode !== 'fixed_unit_price' ? (
            <Field
              data-invalid={Boolean(
                form.formState.errors.official_price_version_id
              )}
            >
              <FieldLabel htmlFor='purchase-official-version'>
                {t('Official Version')}
              </FieldLabel>
              <NativeSelect
                id='purchase-official-version'
                className='w-full'
                aria-invalid={Boolean(
                  form.formState.errors.official_price_version_id
                )}
                {...form.register('official_price_version_id')}
              >
                <NativeSelectOption value=''>
                  {t('Select a version')}
                </NativeSelectOption>
                {eligibleOfficialVersions.map((version) => (
                  <NativeSelectOption
                    key={version.id}
                    value={String(version.id)}
                  >
                    {t('Version')} {version.version} · {t(version.status)}
                    {' · '}
                    {t(version.price_structure)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError>
                {form.formState.errors.official_price_version_id?.message
                  ? t(form.formState.errors.official_price_version_id.message)
                  : null}
              </FieldError>
              {eligibleOfficialVersions.length === 0 ? (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Publish a compatible official price before creating a discount-based purchase version.'
                  )}
                </p>
              ) : null}
            </Field>
          ) : null}
          {pricingMode === 'fixed_unit_price' ? (
            <Field>
              <FieldLabel htmlFor='purchase-currency'>
                {t('Currency')}
              </FieldLabel>
              <Input
                id='purchase-currency'
                maxLength={8}
                {...form.register('currency')}
              />
            </Field>
          ) : null}
          {pricingMode === 'official_ratio' ? (
            <PriceInputField
              id='purchase-discount'
              label='Purchase Discount (0–1)'
              registration={form.register('purchase_discount')}
              error={form.formState.errors.purchase_discount}
            />
          ) : null}
          {pricingMode === 'component_ratio' ? (
            <>
              <PriceInputField
                id='purchase-input-discount'
                label='Input discount'
                registration={form.register('input_discount')}
                error={form.formState.errors.input_discount}
              />
              <PriceInputField
                id='purchase-output-discount'
                label='Output discount'
                registration={form.register('output_discount')}
                error={form.formState.errors.output_discount}
              />
              <PriceInputField
                id='purchase-cache-read-discount'
                label='Cache read discount'
                registration={form.register('cache_read_discount')}
                error={form.formState.errors.cache_read_discount}
              />
              <PriceInputField
                id='purchase-cache-write-discount'
                label='Cache write discount'
                registration={form.register('cache_write_discount')}
                error={form.formState.errors.cache_write_discount}
              />
              <PriceInputField
                id='purchase-image-input-discount'
                label='Image input discount'
                registration={form.register('image_input_discount')}
                error={form.formState.errors.image_input_discount}
              />
              <PriceInputField
                id='purchase-image-output-discount'
                label='Image output discount'
                registration={form.register('image_output_discount')}
                error={form.formState.errors.image_output_discount}
              />
              <PriceInputField
                id='purchase-audio-input-discount'
                label='Audio input discount'
                registration={form.register('audio_input_discount')}
                error={form.formState.errors.audio_input_discount}
              />
              <PriceInputField
                id='purchase-audio-output-discount'
                label='Audio output discount'
                registration={form.register('audio_output_discount')}
                error={form.formState.errors.audio_output_discount}
              />
            </>
          ) : null}
          {pricingMode === 'fixed_unit_price' ? (
            <>
              <PriceInputField
                id='purchase-input-price'
                label='Input / 1M tokens'
                registration={form.register('input_unit_price')}
                error={form.formState.errors.input_unit_price}
              />
              <PriceInputField
                id='purchase-output-price'
                label='Output / 1M tokens'
                registration={form.register('output_unit_price')}
                error={form.formState.errors.output_unit_price}
              />
              <PriceInputField
                id='purchase-cache-read-price'
                label='Cache Read / 1M tokens'
                registration={form.register('cache_read_unit_price')}
                error={form.formState.errors.cache_read_unit_price}
              />
              <PriceInputField
                id='purchase-cache-write-price'
                label='Cache Write / 1M tokens'
                registration={form.register('cache_write_unit_price')}
                error={form.formState.errors.cache_write_unit_price}
              />
              <PriceInputField
                id='purchase-image-input-price'
                label='Image Input / 1M tokens'
                registration={form.register('image_input_unit_price')}
                error={form.formState.errors.image_input_unit_price}
              />
              <PriceInputField
                id='purchase-image-output-price'
                label='Image Output / 1M tokens'
                registration={form.register('image_output_unit_price')}
                error={form.formState.errors.image_output_unit_price}
              />
              <PriceInputField
                id='purchase-audio-input-price'
                label='Audio Input / 1M tokens'
                registration={form.register('audio_input_unit_price')}
                error={form.formState.errors.audio_input_unit_price}
              />
              <PriceInputField
                id='purchase-audio-output-price'
                label='Audio Output / 1M tokens'
                registration={form.register('audio_output_unit_price')}
                error={form.formState.errors.audio_output_unit_price}
              />
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor='purchase-quote-reference'>
              {t('Quote ID')}
            </FieldLabel>
            <Input
              id='purchase-quote-reference'
              {...form.register('quote_reference')}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor='purchase-contract-reference'>
              {t('Contract ID')}
            </FieldLabel>
            <Input
              id='purchase-contract-reference'
              {...form.register('contract_reference')}
            />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor='purchase-remark'>{t('Remark')}</FieldLabel>
          <Textarea id='purchase-remark' {...form.register('remark')} />
        </Field>
        <Button
          type='submit'
          disabled={
            createMutation.isPending ||
            (pricingMode !== 'fixed_unit_price' &&
              eligibleOfficialVersions.length === 0)
          }
        >
          {t(editVersionId ? 'Update Draft' : 'Save Draft')}
        </Button>
      </form>

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Version History')}</h3>
        <VersionList
          items={props.versions.map((version) => ({
            ...version,
            dependency_label: version.official_price_version_id
              ? `${t('Official Version')} #${version.official_price_version_id}`
              : undefined,
          }))}
          isPublishing={props.isPublishing}
          isSuspending={props.isSuspending}
          isDeleting={props.isDeleting}
          onPublish={props.onPublish}
          onSuspend={props.onSuspend}
          onDelete={props.onDelete}
          onView={(id) =>
            setDetailVersion(
              props.versions.find((version) => version.id === id) ?? null
            )
          }
          onFill={fillFromVersion}
          onEdit={editVersion}
        />
      </section>
      <ChannelPriceVersionDialog
        kind='purchase'
        version={detailVersion}
        officialVersion={props.officialVersions.find(
          (version) => version.id === detailVersion?.official_price_version_id
        )}
        onOpenChange={(open) => {
          if (!open) {
            setDetailVersion(null)
          }
        }}
      />
    </div>
  )
}
