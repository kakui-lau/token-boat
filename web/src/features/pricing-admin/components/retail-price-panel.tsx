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
import { type ReactNode, useMemo, useState } from 'react'
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

import { createRetailDraft, updateRetailDraft } from '../api'
import {
  priceComponentLabels,
  type PriceRule,
  readPriceComponents,
} from '../lib/price-components'
import {
  formatStoredRatePercentage,
  percentageToStoredRate,
  storedRateToPercentage,
} from '../lib/rate-format'
import { retailPriceExceedsOfficial } from '../lib/retail-price-cap'
import { retailPriceSchema, type RetailPriceForm } from '../lib/schemas'
import type {
  OfficialPriceVersion,
  PurchasePriceVersion,
  RetailPriceVersion,
} from '../types'
import { ChannelPriceVersionDialog } from './channel-price-version-dialog'
import { PercentageInputField } from './percentage-input-field'
import { VersionList } from './version-list'

type RetailPricePanelProps = {
  channelModelId: number
  officialVersions: OfficialPriceVersion[]
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
  const [detailVersion, setDetailVersion] = useState<RetailPriceVersion | null>(
    null
  )
  const [editVersionId, setEditVersionId] = useState<number | null>(null)
  const [editVersionUpdatedAt, setEditVersionUpdatedAt] = useState<
    number | undefined
  >(undefined)
  const detailPurchaseVersion = detailVersion
    ? props.purchaseVersions.find(
        (version) => version.id === detailVersion.purchase_price_version_id
      )
    : undefined
  const detailOfficialVersion = detailPurchaseVersion?.official_price_version_id
    ? props.officialVersions.find(
        (version) =>
          version.id === detailPurchaseVersion.official_price_version_id
      )
    : undefined
  const form = useForm<RetailPriceForm>({
    resolver: zodResolver(retailPriceSchema),
    defaultValues: {
      purchase_price_version_id: '',
      total_variable_cost_rate: '0',
      effective_tax_rate: '0',
      target_net_margin: '10',
      minimum_margin_rate: '0',
      remark: '',
    },
  })
  const watchedValues = useWatch({ control: form.control })
  const eligiblePurchaseVersions = useMemo(
    () =>
      props.purchaseVersions.filter(
        (version) => version.status === 'active' || version.status === 'draft'
      ),
    [props.purchaseVersions]
  )
  const selectedPurchase = eligiblePurchaseVersions.find(
    (version) => version.id === Number(watchedValues.purchase_price_version_id)
  )
  const selectedOfficial = selectedPurchase?.official_price_version_id
    ? props.officialVersions.find(
        (version) => version.id === selectedPurchase.official_price_version_id
      )
    : undefined
  const preview = useMemo(() => {
    if (!selectedPurchase) {
      return null
    }
    const vcr = Number(
      percentageToStoredRate(watchedValues.total_variable_cost_rate || '')
    )
    const tax = Number(
      percentageToStoredRate(watchedValues.effective_tax_rate || '')
    )
    const margin = Number(
      percentageToStoredRate(watchedValues.target_net_margin || '')
    )
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
      const unrounded = Number((Number(value) * factor).toFixed(12))
      return (Math.ceil(unrounded * 100_000) / 100_000).toFixed(5)
    }
    const priceComponents = readPriceComponents(
      selectedPurchase.price_components
    )
    const officialComponents = readPriceComponents(
      selectedOfficial?.price_components
    )
    const officialRules = Array.isArray(officialComponents.rules)
      ? (officialComponents.rules as PriceRule[])
      : []
    const rules = Array.isArray(priceComponents.rules)
      ? (priceComponents.rules as PriceRule[])
          .filter((rule) => Boolean(rule.unit_price))
          .map((rule, index) => ({
            key: rule.id || `${rule.component || 'rule'}-${index}`,
            name: rule.name || `#${index + 1}`,
            component:
              priceComponentLabels[rule.component || ''] ||
              rule.component ||
              'Price rule',
            price: scale(rule.unit_price || ''),
            officialPrice:
              officialRules.find(
                (officialRule) =>
                  Boolean(rule.id) && officialRule.id === rule.id
              )?.unit_price ||
              officialRules[index]?.unit_price ||
              '—',
            unit: rule.unit || '',
            unitSize: rule.unit_size || '1',
          }))
      : []
    const componentKeys = [
      'input_unit_price',
      'output_unit_price',
      'cache_read_unit_price',
      'cache_write_unit_price',
      'image_input_unit_price',
      'image_output_unit_price',
      'audio_input_unit_price',
      'audio_output_unit_price',
    ]
    const snapshotFallbacks: Record<string, string> = {
      input_unit_price: selectedPurchase.input_unit_price,
      output_unit_price: selectedPurchase.output_unit_price,
      cache_read_unit_price: selectedPurchase.cache_read_unit_price,
      cache_write_unit_price: selectedPurchase.cache_write_unit_price,
    }
    const componentPrices = componentKeys.flatMap((key) => {
      const value = String(priceComponents[key] ?? snapshotFallbacks[key] ?? '')
      if (!value) {
        return []
      }
      return [
        {
          key,
          label: priceComponentLabels[key] || key,
          price: scale(value),
          officialPrice: String(officialComponents[key] ?? '') || '—',
        },
      ]
    })
    return {
      valid: true as const,
      factor,
      rules,
      componentPrices,
      currency: selectedPurchase.currency,
    }
  }, [
    selectedPurchase,
    selectedOfficial,
    watchedValues.effective_tax_rate,
    watchedValues.target_net_margin,
    watchedValues.total_variable_cost_rate,
  ])
  const exceedsOfficialPrice =
    preview?.valid === true &&
    selectedPurchase &&
    selectedOfficial &&
    retailPriceExceedsOfficial(
      selectedPurchase,
      selectedOfficial,
      preview.factor
    )
  let previewPriceDetails: ReactNode = null
  if (preview?.valid && preview.rules.length > 0) {
    previewPriceDetails = (
      <div className='space-y-2 text-sm'>
        {preview.rules.map((rule) => (
          <div
            key={rule.key}
            className='flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2'
          >
            <span>
              <span className='font-medium'>{rule.name}</span>
              {' · '}
              {t(rule.component)}
            </span>
            <span className='space-y-1 text-right font-mono'>
              <span className='block'>
                {t('Official Price')}: {rule.officialPrice} {preview.currency}
                {rule.unit ? ` / ${rule.unitSize} ${t(rule.unit)}` : ''}
              </span>
              <span className='block'>
                {t('Retail Price')}: {rule.price} {preview.currency}
                {rule.unit ? ` / ${rule.unitSize} ${t(rule.unit)}` : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    )
  } else if (preview?.valid) {
    previewPriceDetails = (
      <div className='grid gap-2 text-sm sm:grid-cols-2'>
        {preview.componentPrices.map((component) => (
          <div
            key={component.key}
            className='flex items-center justify-between gap-2 rounded-md border px-3 py-2'
          >
            <span>{t(component.label)}</span>
            <span className='space-y-1 text-right font-mono'>
              <span className='block'>
                {t('Official Price')}: {component.officialPrice}{' '}
                {preview.currency}
              </span>
              <span className='block'>
                {t('Retail Price')}: {component.price} {preview.currency}
              </span>
            </span>
          </div>
        ))}
      </div>
    )
  } else if (preview) {
    previewPriceDetails = (
      <p className='text-destructive text-sm'>
        {t(
          'The configured costs, tax, and target margin produce an invalid retail denominator.'
        )}
      </p>
    )
  }
  const createMutation = useMutation({
    mutationFn: (value: RetailPriceForm) => {
      const payload = {
        channel_model_id: props.channelModelId,
        purchase_price_version_id: Number(value.purchase_price_version_id),
        total_variable_cost_rate: percentageToStoredRate(
          value.total_variable_cost_rate
        ),
        effective_tax_rate: percentageToStoredRate(value.effective_tax_rate),
        target_net_margin: percentageToStoredRate(value.target_net_margin),
        minimum_margin_rate: percentageToStoredRate(value.minimum_margin_rate),
        remark: value.remark,
        expected_updated_at: editVersionUpdatedAt,
      }
      return editVersionId
        ? updateRetailDraft(editVersionId, payload)
        : createRetailDraft(payload)
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
            ? 'Retail price draft updated'
            : 'Retail price draft created'
        )
      )
    },
  })
  const editVersion = (id: number) => {
    const version = props.versions.find((item) => item.id === id)
    if (!version) {
      return
    }
    form.reset({
      purchase_price_version_id: String(version.purchase_price_version_id),
      total_variable_cost_rate: storedRateToPercentage(
        version.total_variable_cost_rate
      ),
      effective_tax_rate: storedRateToPercentage(version.effective_tax_rate),
      target_net_margin: storedRateToPercentage(version.target_net_margin),
      minimum_margin_rate: storedRateToPercentage(version.minimum_margin_rate),
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
    form.reset({
      purchase_price_version_id: String(version.purchase_price_version_id),
      total_variable_cost_rate: storedRateToPercentage(
        version.total_variable_cost_rate
      ),
      effective_tax_rate: storedRateToPercentage(version.effective_tax_rate),
      target_net_margin: storedRateToPercentage(version.target_net_margin),
      minimum_margin_rate: storedRateToPercentage(version.minimum_margin_rate),
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
            {t(editVersionId ? 'Edit Retail Version' : 'New Retail Version')}
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
          <Field
            data-invalid={Boolean(
              form.formState.errors.purchase_price_version_id
            )}
          >
            <FieldLabel htmlFor='retail-purchase-version'>
              {t('Purchase Version')}
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
              {eligiblePurchaseVersions.map((version) => (
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
            {eligiblePurchaseVersions.length === 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Create or activate a purchase price version before creating a retail version.'
                )}
              </p>
            ) : null}
          </Field>
          <PercentageInputField
            id='retail-vcr'
            label='Variable Cost Rate (VCR)'
            registration={form.register('total_variable_cost_rate')}
            error={form.formState.errors.total_variable_cost_rate}
          />
          <PercentageInputField
            id='retail-tax'
            label='Tax Rate (TR)'
            registration={form.register('effective_tax_rate')}
            error={form.formState.errors.effective_tax_rate}
          />
          <PercentageInputField
            id='retail-target-margin'
            label='Target Margin (TM)'
            registration={form.register('target_net_margin')}
            error={form.formState.errors.target_net_margin}
          />
          <PercentageInputField
            id='retail-minimum-margin'
            label='Margin Floor'
            description='Used only for price simulation and margin alerts; it does not affect retail price generation.'
            registration={form.register('minimum_margin_rate')}
            error={form.formState.errors.minimum_margin_rate}
          />
        </FieldGroup>
        <p className='text-muted-foreground text-xs'>
          {t('Enter rates as percentages; for example, enter 16.5 for 16.5%.')}
        </p>
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
              <p className='font-medium'>{t('Price Preview')}</p>
              {preview.valid ? (
                <span className='text-emerald-600 text-xs dark:text-emerald-400'>
                  {t('Selling Factor')}:{' '}
                  {(Math.ceil(preview.factor * 100) / 100).toFixed(2)}
                </span>
              ) : null}
            </div>
            {previewPriceDetails}
            <p className='text-muted-foreground text-xs'>
              {t(
                'This preview is informational. The backend recalculates exact decimal prices when the draft is saved.'
              )}
            </p>
          </div>
        ) : null}
        {exceedsOfficialPrice ? (
          <p
            className='text-destructive text-sm'
            role='alert'
            aria-label={t(
              'Retail price must be lower than the official price.'
            )}
          >
            {t('Retail price must be lower than the official price.')}
          </p>
        ) : null}
        <Button
          type='submit'
          disabled={
            createMutation.isPending ||
            preview?.valid === false ||
            Boolean(exceedsOfficialPrice) ||
            eligiblePurchaseVersions.length === 0
          }
        >
          {t(editVersionId ? 'Update Draft' : 'Save Draft')}
        </Button>
      </form>

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Version History')}</h3>
        <VersionList
          items={props.versions.map((version) => {
            const purchaseVersion = props.purchaseVersions.find(
              (purchase) => purchase.id === version.purchase_price_version_id
            )
            return {
              ...version,
              dependency_label:
                `${t('Purchase Version')} #${version.purchase_price_version_id}` +
                ` · ${t('Target Margin (TM)')} ${formatStoredRatePercentage(version.target_net_margin)}` +
                ` · ${t('Margin Floor')} ${formatStoredRatePercentage(version.minimum_margin_rate)}`,
              publish_dependency_notice:
                purchaseVersion?.status === 'draft'
                  ? t(
                      'Publishing this retail version will also publish purchase version {{version}} in the same transaction.',
                      { version: purchaseVersion.version }
                    )
                  : undefined,
            }
          })}
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
        kind='retail'
        version={detailVersion}
        purchaseVersion={detailPurchaseVersion}
        officialVersion={detailOfficialVersion}
        onOpenChange={(open) => {
          if (!open) {
            setDetailVersion(null)
          }
        }}
      />
    </div>
  )
}
