/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { PurchasePriceVersion, RetailPriceVersion } from '../types'

type ChannelPriceVersionDialogProps = {
  kind: 'purchase' | 'retail'
  version: PurchasePriceVersion | RetailPriceVersion | null
  onOpenChange: (open: boolean) => void
}

const componentLabels: Record<string, string> = {
  input_unit_price: 'Input / 1M tokens',
  output_unit_price: 'Output / 1M tokens',
  cache_read_unit_price: 'Cache Read / 1M tokens',
  cache_write_unit_price: 'Cache Write / 1M tokens',
  image_input_unit_price: 'Image Input / 1M tokens',
  image_output_unit_price: 'Image Output / 1M tokens',
  audio_input_unit_price: 'Audio Input / 1M tokens',
  audio_output_unit_price: 'Audio Output / 1M tokens',
  request_unit_price: 'Per Request',
  video_second_unit_price: 'Per Video Second',
  token_input: 'Token input',
  token_output: 'Token output',
  cache_read: 'Cache read',
  cache_write: 'Cache write',
  image_input: 'Image input',
  image_output: 'Image output',
  audio_input: 'Audio input',
  audio_output: 'Audio output',
  request: 'Request',
  image: 'Image',
  audio_second: 'Audio second',
  video_second: 'Video second',
  character: 'Character',
}

type PriceRule = {
  id?: string
  name?: string
  component?: string
  unit?: string
  unit_size?: string
  unit_price?: string
  upper_bound?: string
  operation?: string
  quality?: string
  resolution?: string
  with_audio?: string
}

export function ChannelPriceVersionDialog(
  props: ChannelPriceVersionDialogProps
) {
  const { t } = useTranslation()
  const version = props.version
  let components: Record<string, unknown> = {}
  if (version?.price_components) {
    try {
      components = JSON.parse(version.price_components) as Record<
        string,
        unknown
      >
    } catch {
      components = {}
    }
  }
  const componentEntries = Object.entries(components).filter(
    ([key, value]) =>
      !key.startsWith('legacy_') &&
      key !== 'price_unit' &&
      key !== 'schema_version' &&
      key !== 'rules' &&
      typeof value !== 'object'
  )
  const priceRules = Array.isArray(components.rules)
    ? (components.rules as PriceRule[])
    : []
  const isPurchase = props.kind === 'purchase'
  const purchase = isPurchase ? (version as PurchasePriceVersion | null) : null
  const retail = !isPurchase ? (version as RetailPriceVersion | null) : null
  const expression =
    purchase?.purchase_billing_expr ?? retail?.retail_billing_expr

  return (
    <Dialog open={version !== null} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>
            {t(
              isPurchase ? 'Purchase Version Details' : 'Retail Version Details'
            )}
            {' · '}v{version?.version}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Review the complete pricing snapshot and its upstream dependencies.'
            )}
          </DialogDescription>
        </DialogHeader>
        {version ? (
          <div className='space-y-5'>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {[
                [t('Status'), t(version.status)],
                [t('Billing Mode'), t(version.billing_mode)],
                [t('Price Structure'), t(version.price_structure)],
                [t('Currency'), version.currency],
              ].map(([label, value]) => (
                <div key={label} className='rounded-lg border p-3'>
                  <p className='text-muted-foreground text-xs'>{label}</p>
                  <p className='mt-1 font-medium'>{value || '—'}</p>
                </div>
              ))}
            </div>

            <section className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('Price Components')}</h3>
              {priceRules.length > 0 ? (
                <div className='space-y-2'>
                  {priceRules.map((rule, index) => {
                    const conditions = [
                      rule.operation && `${t('Operation')}: ${rule.operation}`,
                      rule.quality && `${t('Quality')}: ${rule.quality}`,
                      rule.resolution &&
                        `${t('Resolution')}: ${rule.resolution}`,
                      rule.with_audio === 'true' && t('With audio'),
                      rule.with_audio === 'false' && t('Without audio'),
                      rule.upper_bound &&
                        `${t('Usage upper bound')}: ${rule.upper_bound}`,
                    ].filter(Boolean)
                    return (
                      <div
                        key={rule.id || `${rule.component}-${index}`}
                        className='rounded-lg border p-3'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <div className='flex items-center gap-2'>
                            <Badge variant='outline'>
                              {rule.name || `#${index + 1}`}
                            </Badge>
                            <span className='font-medium'>
                              {t(
                                componentLabels[rule.component || ''] ??
                                  rule.component ??
                                  'Price rule'
                              )}
                            </span>
                          </div>
                          <span className='font-mono text-sm'>
                            {rule.unit_price || '0'} {version.currency} /{' '}
                            {rule.unit_size || '1'} {rule.unit || ''}
                          </span>
                        </div>
                        {conditions.length > 0 ? (
                          <p className='text-muted-foreground mt-2 text-xs'>
                            {conditions.join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ) : null}
              <div className='grid gap-2 sm:grid-cols-2'>
                {componentEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className='flex items-center justify-between gap-4 rounded-lg border px-3 py-2 text-sm'
                  >
                    <span className='text-muted-foreground'>
                      {t(componentLabels[key] ?? key)}
                    </span>
                    <span className='font-mono'>
                      {String(value)} {version.currency}
                    </span>
                  </div>
                ))}
                {componentEntries.length === 0 && priceRules.length === 0 ? (
                  <p className='text-muted-foreground col-span-full rounded-lg border border-dashed p-3 text-sm'>
                    {t('No structured price components')}
                  </p>
                ) : null}
              </div>
            </section>

            {isPurchase ? (
              <div className='grid gap-3 text-sm sm:grid-cols-2'>
                <Detail
                  label={t('Cost Basis')}
                  value={t(purchase?.pricing_mode ?? '')}
                />
                <Detail
                  label={t('Official Version')}
                  value={
                    purchase?.official_price_version_id
                      ? `#${purchase.official_price_version_id}`
                      : '—'
                  }
                />
                <Detail
                  label={t('Purchase Discount (0–1)')}
                  value={purchase?.purchase_discount || '—'}
                />
                <Detail
                  label={t('Quote ID')}
                  value={purchase?.quote_reference || '—'}
                />
                <Detail
                  label={t('Contract ID')}
                  value={purchase?.contract_reference || '—'}
                />
                <Detail
                  label={t('Conditions')}
                  value={purchase?.conditions || '—'}
                />
              </div>
            ) : (
              <div className='grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4'>
                <Detail
                  label={t('Purchase Version')}
                  value={`#${retail?.purchase_price_version_id}`}
                />
                <Detail
                  label={t('Variable Cost Rate (VCR)')}
                  value={retail?.total_variable_cost_rate || '—'}
                />
                <Detail
                  label={t('Tax Rate (TR)')}
                  value={retail?.effective_tax_rate || '—'}
                />
                <Detail
                  label={t('Target Margin (TM)')}
                  value={retail?.target_net_margin || '—'}
                />
                <Detail
                  label={t('Margin Floor')}
                  value={retail?.minimum_margin_rate || '—'}
                />
              </div>
            )}

            <section className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('Billing Expression')}</h3>
              <pre className='bg-muted/50 max-h-52 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap'>
                {expression || '—'}
              </pre>
            </section>

            <div className='grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4'>
              <Detail
                label={t('Expression Source')}
                value={version.expression_source || '—'}
              />
              <Detail
                label={t('Schema Version')}
                value={version.expression_schema_version || '—'}
              />
              <Detail
                label={t('Created At')}
                value={
                  version.created_at
                    ? dayjs.unix(version.created_at).format('YYYY-MM-DD HH:mm')
                    : '—'
                }
              />
              <Detail
                label={t('Effective Period')}
                value={`${formatTime(version.effective_from)} → ${formatTime(version.effective_to)}`}
              />
            </div>
            {version.remark ? (
              <section className='space-y-2'>
                <h3 className='text-sm font-medium'>{t('Remark')}</h3>
                <p className='rounded-lg border p-3 text-sm whitespace-pre-wrap'>
                  {version.remark}
                </p>
              </section>
            ) : null}
            {version.status !== 'draft' ? (
              <Badge variant='outline'>
                {t('Published versions are immutable snapshots')}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Detail(props: { label: string; value: string }) {
  return (
    <div className='rounded-lg border p-3'>
      <p className='text-muted-foreground text-xs'>{props.label}</p>
      <p className='mt-1 break-words'>{props.value}</p>
    </div>
  )
}

function formatTime(value: number) {
  return value ? dayjs.unix(value).format('YYYY-MM-DD HH:mm') : '—'
}
