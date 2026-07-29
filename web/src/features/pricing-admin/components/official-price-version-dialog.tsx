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

import type { OfficialPriceVersion } from '../types'

type OfficialPriceVersionDialogProps = {
  version: OfficialPriceVersion | null
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

type TokenPriceTier = {
  name?: string
  upper_bound?: string
  input_unit_price?: string
  output_unit_price?: string
  cache_read_unit_price?: string
  cache_write_unit_price?: string
  image_input_unit_price?: string
  image_output_unit_price?: string
  audio_input_unit_price?: string
  audio_output_unit_price?: string
}

export function OfficialPriceVersionDialog(
  props: OfficialPriceVersionDialogProps
) {
  const { t } = useTranslation()
  const version = props.version
  let components: Record<string, unknown> = {}
  if (version) {
    try {
      components = JSON.parse(version.price_components) as Record<
        string,
        unknown
      >
    } catch {
      components = {}
    }
  }
  const priceRules = Array.isArray(components.rules)
    ? (components.rules as PriceRule[])
    : []
  const priceTiers = Array.isArray(components.tiers)
    ? (components.tiers.filter(
        (tier) => tier !== null && typeof tier === 'object'
      ) as TokenPriceTier[])
    : []
  const componentEntries = Object.entries(components).filter(
    ([key, value]) =>
      !key.startsWith('legacy_') &&
      key !== 'price_unit' &&
      key !== 'schema_version' &&
      key !== 'rules' &&
      key !== 'tiers' &&
      (typeof value === 'string' || typeof value === 'number') &&
      String(value).trim() !== ''
  )

  const billingLabels: Record<string, string> = {
    token: t('Token'),
    request: t('Per request'),
    image: t('Image'),
    audio_duration: t('Audio duration'),
    video_duration: t('Video duration'),
    character: t('Character'),
    mixed: t('Mixed'),
  }
  const structureLabels: Record<string, string> = {
    flat: t('Flat rate'),
    tiered: t('Tiered pricing'),
    expression: t('Expression pricing'),
  }

  return (
    <Dialog
      open={version !== null}
      onOpenChange={(open) => props.onOpenChange(open)}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Version Configuration')} · v{version?.version}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Published versions are immutable snapshots. Draft versions remain editable until publication.'
            )}
          </DialogDescription>
        </DialogHeader>

        {version ? (
          <div className='space-y-5'>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {[
                [t('Status'), t(version.status)],
                [
                  t('Billing Mode'),
                  billingLabels[version.billing_mode] ?? version.billing_mode,
                ],
                [
                  t('Price Structure'),
                  structureLabels[version.price_structure] ??
                    version.price_structure,
                ],
                [t('Currency'), version.currency],
              ].map(([label, value]) => (
                <div key={label} className='rounded-lg border p-3'>
                  <p className='text-muted-foreground text-xs'>{label}</p>
                  <p className='mt-1 font-medium'>{value}</p>
                </div>
              ))}
            </div>

            <section className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('Price Components')}</h3>
              {priceRules.length > 0 && (
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
              )}
              {priceRules.length === 0 && priceTiers.length > 0 ? (
                <div className='space-y-3'>
                  {priceTiers.map((tier, index) => {
                    const previousUpperBound =
                      index > 0 ? priceTiers[index - 1].upper_bound : undefined
                    const currentUpperBound = tier.upper_bound
                    const previousBoundNumber = Number(previousUpperBound)
                    const currentBoundNumber = Number(currentUpperBound)
                    const previousBound =
                      previousUpperBound && Number.isFinite(previousBoundNumber)
                        ? previousBoundNumber.toLocaleString()
                        : previousUpperBound || ''
                    const currentBound =
                      currentUpperBound && Number.isFinite(currentBoundNumber)
                        ? currentBoundNumber.toLocaleString()
                        : currentUpperBound || ''
                    let contextRange = t('Fallback tier')
                    if (previousBound && currentBound) {
                      contextRange = `${previousBound} < ${t(
                        'Context'
                      )} ≤ ${currentBound} ${t('tokens')}`
                    } else if (currentBound) {
                      contextRange = `${t(
                        'Context'
                      )} ≤ ${currentBound} ${t('tokens')}`
                    } else if (previousBound) {
                      contextRange = `${t(
                        'Context'
                      )} > ${previousBound} ${t('tokens')}`
                    }
                    let tierName =
                      tier.name?.replaceAll('_', ' ') ||
                      `${t('Tier')} ${index + 1}`
                    if (tier.name === 'standard') {
                      tierName = t('Standard')
                    } else if (tier.name === 'long_context') {
                      tierName = t('Long context')
                    }
                    const tierPriceEntries = Object.entries(tier).filter(
                      ([key, value]) =>
                        componentLabels[key] !== undefined &&
                        value !== undefined &&
                        String(value).trim() !== ''
                    )

                    return (
                      <article
                        key={`${tier.name || 'tier'}-${
                          tier.upper_bound || 'unbounded'
                        }`}
                        className='overflow-hidden rounded-lg border'
                      >
                        <div className='bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5'>
                          <div className='flex items-center gap-2'>
                            <Badge variant='outline'>{tierName}</Badge>
                            <span className='text-muted-foreground text-xs'>
                              {contextRange}
                            </span>
                          </div>
                        </div>
                        <div className='bg-border grid gap-px sm:grid-cols-2 lg:grid-cols-4'>
                          {tierPriceEntries.map(([key, value]) => (
                            <div key={key} className='bg-popover px-3 py-2.5'>
                              <p className='text-muted-foreground text-xs'>
                                {t(componentLabels[key])}
                              </p>
                              <p className='mt-1 font-mono text-sm font-medium'>
                                {value} {version.currency}
                              </p>
                            </div>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : null}
              {priceRules.length === 0 &&
                priceTiers.length === 0 &&
                componentEntries.length > 0 && (
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
                  </div>
                )}
              {priceRules.length === 0 &&
                priceTiers.length === 0 &&
                componentEntries.length === 0 && (
                  <p className='text-muted-foreground rounded-lg border border-dashed p-3 text-sm'>
                    {t('No structured price components')}
                  </p>
                )}
            </section>

            <section className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('Billing Expression')}</h3>
              <pre className='bg-muted/50 max-h-52 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap'>
                {version.billing_expr}
              </pre>
            </section>

            <div className='grid gap-3 text-sm sm:grid-cols-2'>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-xs'>{t('Source')}</p>
                <p className='mt-1'>
                  {version.source}
                  {version.source_version ? ` · ${version.source_version}` : ''}
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-xs'>
                  {t('Schema Version')}
                </p>
                <p className='mt-1'>
                  {version.expression_schema_version || '—'}
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-xs'>
                  {t('Created At')}
                </p>
                <p className='mt-1'>
                  {version.created_at
                    ? dayjs.unix(version.created_at).format('YYYY-MM-DD HH:mm')
                    : '—'}
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-xs'>
                  {t('Effective Period')}
                </p>
                <p className='mt-1'>
                  {version.effective_from
                    ? dayjs
                        .unix(version.effective_from)
                        .format('YYYY-MM-DD HH:mm')
                    : '—'}
                  {' → '}
                  {version.effective_to
                    ? dayjs
                        .unix(version.effective_to)
                        .format('YYYY-MM-DD HH:mm')
                    : '—'}
                </p>
              </div>
            </div>

            {version.remark ? (
              <section className='space-y-2'>
                <h3 className='text-sm font-medium'>{t('Remark')}</h3>
                <p className='rounded-lg border p-3 text-sm whitespace-pre-wrap'>
                  {version.remark}
                </p>
              </section>
            ) : null}

            {version.billing_mode !== 'token' ? (
              <Badge variant='outline'>
                {t('Draft only until the V2 runtime supports this mode')}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
