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
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import { createRetailDraft } from '../api'
import { retailPriceSchema, type RetailPriceForm } from '../lib/schemas'
import type { PurchasePriceVersion, RetailPriceVersion } from '../types'
import { PriceInputField } from './price-input-field'
import { VersionList } from './version-list'

type RetailPricePanelProps = {
  channelModelId: number
  purchaseVersions: PurchasePriceVersion[]
  versions: RetailPriceVersion[]
  isPublishing: boolean
  isSuspending: boolean
  isDeleting: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
  onDelete: (id: number) => void
  onCreated: () => Promise<void>
}

export function RetailPricePanel(props: RetailPricePanelProps) {
  const { t } = useTranslation()
  const form = useForm<RetailPriceForm>({
    resolver: zodResolver(retailPriceSchema),
    defaultValues: {
      purchase_price_version_id: '',
      total_variable_cost_rate: '0',
      effective_tax_rate: '0',
      target_net_margin: '0.1',
      minimum_margin_rate: '0',
      remark: '',
    },
  })
  const watchedValues = useWatch({ control: form.control })
  const selectedPurchase = props.purchaseVersions.find(
    (version) => version.id === Number(watchedValues.purchase_price_version_id)
  )
  const preview = useMemo(() => {
    if (!selectedPurchase) {
      return null
    }
    const vcr = Number(watchedValues.total_variable_cost_rate)
    const tax = Number(watchedValues.effective_tax_rate)
    const margin = Number(watchedValues.target_net_margin)
    if (
      !Number.isFinite(vcr) ||
      !Number.isFinite(tax) ||
      !Number.isFinite(margin) ||
      vcr < 0 ||
      tax < 0 ||
      margin < 0
    ) {
      return null
    }
    const denominator = (1 - vcr) * (1 - tax) - margin
    if (denominator <= 0) {
      return { valid: false as const }
    }
    const factor = (1 - tax) / denominator
    const scale = (value: string) => {
      if (value.trim() === '') {
        return '—'
      }
      return Number((Number(value) * factor).toFixed(8)).toString()
    }
    return {
      valid: true as const,
      factor,
      input: scale(selectedPurchase.input_unit_price),
      output: scale(selectedPurchase.output_unit_price),
      cacheRead: scale(selectedPurchase.cache_read_unit_price),
      cacheWrite: scale(selectedPurchase.cache_write_unit_price),
      currency: selectedPurchase.currency,
    }
  }, [
    selectedPurchase,
    watchedValues.effective_tax_rate,
    watchedValues.target_net_margin,
    watchedValues.total_variable_cost_rate,
  ])
  const createMutation = useMutation({
    mutationFn: (value: RetailPriceForm) =>
      createRetailDraft({
        channel_model_id: props.channelModelId,
        purchase_price_version_id: Number(value.purchase_price_version_id),
        total_variable_cost_rate: value.total_variable_cost_rate,
        effective_tax_rate: value.effective_tax_rate,
        target_net_margin: value.target_net_margin,
        minimum_margin_rate: value.minimum_margin_rate,
        remark: value.remark,
      }),
    onSuccess: async () => {
      form.reset()
      await props.onCreated()
      toast.success(t('Retail price draft created'))
    },
  })

  return (
    <div className='space-y-6'>
      <form
        className='space-y-4 rounded-lg border p-4'
        onSubmit={form.handleSubmit((value) => createMutation.mutate(value))}
      >
        <h3 className='font-medium'>{t('Create retail price draft')}</h3>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field
            data-invalid={Boolean(
              form.formState.errors.purchase_price_version_id
            )}
          >
            <FieldLabel htmlFor='retail-purchase-version'>
              {t('Purchase price version')}
            </FieldLabel>
            <NativeSelect
              id='retail-purchase-version'
              className='w-full'
              aria-invalid={Boolean(
                form.formState.errors.purchase_price_version_id
              )}
              {...form.register('purchase_price_version_id')}
            >
              <NativeSelectOption value=''>
                {t('Select a version')}
              </NativeSelectOption>
              {props.purchaseVersions.map((version) => (
                <NativeSelectOption key={version.id} value={String(version.id)}>
                  {t('Version')} {version.version} · {t(version.status)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError>
              {form.formState.errors.purchase_price_version_id?.message
                ? t(form.formState.errors.purchase_price_version_id.message)
                : null}
            </FieldError>
          </Field>
          <PriceInputField
            id='retail-vcr'
            label='Total variable cost rate (VCR)'
            registration={form.register('total_variable_cost_rate')}
            error={form.formState.errors.total_variable_cost_rate}
          />
          <PriceInputField
            id='retail-tax'
            label='Effective tax rate (TR)'
            registration={form.register('effective_tax_rate')}
            error={form.formState.errors.effective_tax_rate}
          />
          <PriceInputField
            id='retail-target-margin'
            label='Target net margin (TM)'
            registration={form.register('target_net_margin')}
            error={form.formState.errors.target_net_margin}
          />
          <PriceInputField
            id='retail-minimum-margin'
            label='Minimum margin rate'
            registration={form.register('minimum_margin_rate')}
            error={form.formState.errors.minimum_margin_rate}
          />
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor='retail-remark'>{t('Remark')}</FieldLabel>
          <Textarea id='retail-remark' {...form.register('remark')} />
        </Field>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Retail prices are generated from the selected purchase version and the configured cost and margin rates.'
          )}
        </p>
        {preview ? (
          <div className='bg-muted/40 space-y-3 rounded-lg border p-3'>
            <div className='flex items-center justify-between gap-3'>
              <p className='font-medium'>{t('Live retail price preview')}</p>
              {preview.valid ? (
                <span className='text-muted-foreground text-xs'>
                  {t('Retail multiplier')}: {preview.factor.toFixed(6)}
                </span>
              ) : null}
            </div>
            {preview.valid ? (
              <div className='grid gap-2 text-sm sm:grid-cols-2'>
                <p>
                  {t('Input')}: {preview.input} {preview.currency}
                </p>
                <p>
                  {t('Output')}: {preview.output} {preview.currency}
                </p>
                <p>
                  {t('Cache Read')}: {preview.cacheRead} {preview.currency}
                </p>
                <p>
                  {t('Cache Write')}: {preview.cacheWrite} {preview.currency}
                </p>
              </div>
            ) : (
              <p className='text-destructive text-sm'>
                {t(
                  'The configured costs, tax, and target margin produce an invalid retail denominator.'
                )}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>
              {t(
                'This preview is informational. The backend recalculates exact decimal prices when the draft is saved.'
              )}
            </p>
          </div>
        ) : null}
        <Button
          type='submit'
          disabled={createMutation.isPending || preview?.valid === false}
        >
          {t('Save Draft')}
        </Button>
      </form>

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Retail price versions')}</h3>
        <VersionList
          items={props.versions}
          isPublishing={props.isPublishing}
          isSuspending={props.isSuspending}
          isDeleting={props.isDeleting}
          onPublish={props.onPublish}
          onSuspend={props.onSuspend}
          onDelete={props.onDelete}
        />
      </section>
    </div>
  )
}
