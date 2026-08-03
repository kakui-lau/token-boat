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
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { PublicPriceItem, PublicPriceSummary, TokenUnit } from '../types'

const COMPONENT_LABELS: Record<string, string> = {
  token_input: 'Input',
  token_output: 'Output',
  cache_read: 'Cache read',
  cache_write: 'Cache write',
  cache_write_1h: '1h cache write',
  image_token_input: 'Image input',
  image_token_output: 'Image output',
  cached_image_token_input: 'Cached image input',
  audio_token_input: 'Audio input',
  audio_token_output: 'Audio output',
  request: 'Request',
  tool_call: 'Tool call',
  generated_item: 'Generated item',
  image_input: 'Image input',
  image_output: 'Image output',
  audio_input: 'Audio input',
  audio_output: 'Audio output',
  video_input: 'Video input',
  video_output: 'Video output',
  character_input: 'Character input',
  character_output: 'Character output',
}

function itemCondition(
  item: PublicPriceItem,
  translate: (key: string) => string
): string {
  const value =
    item.resolution ||
    item.quality ||
    item.operation ||
    item.tier ||
    (item.with_audio ? `audio:${item.with_audio}` : '')
  if (value === 'standard') return translate('Standard')
  if (value === 'long_context') return translate('Long context')
  if (value.toLowerCase() === '4k_default') return '4K'
  if (value.endsWith('_default')) return value.slice(0, -'_default'.length)
  return value
}

function firstPriceItems(summary?: PublicPriceSummary): PublicPriceItem[] {
  if (!summary || summary.items.length === 0) return []
  if (summary.billing_mode !== 'token') return summary.items.slice(0, 2)

  const firstTier = summary.items[0]?.tier || ''
  const firstTierItems = summary.items.filter(
    (item) => (item.tier || '') === firstTier
  )
  const primary = firstTierItems.filter((item) =>
    ['token_input', 'token_output'].includes(item.component)
  )
  return (primary.length > 0 ? primary : firstTierItems).slice(0, 2)
}

function appliedGroupContext(item: PublicPriceItem): string {
  const group = item.applied_group_label || item.applied_group
  const ratio = item.applied_group_ratio
  if (!group || !ratio) return ''
  return `${group} · ×${ratio}`
}

function commonAppliedGroupContext(items: PublicPriceItem[]): string {
  const contexts = new Set(items.map(appliedGroupContext).filter(Boolean))
  return contexts.size === 1 ? [...contexts][0] : ''
}

function formatAmount(
  item: PublicPriceItem,
  tokenUnit: TokenUnit,
  showRechargePrice = false,
  priceRate = 1,
  usdExchangeRate = 1
): string {
  const rawAmount = Number(item.amount)
  const rawUnitSize = Number(item.unit_size)
  if (!Number.isFinite(rawAmount)) return '-'

  let amount = rawAmount
  if (
    item.unit === 'token' &&
    Number.isFinite(rawUnitSize) &&
    rawUnitSize > 0
  ) {
    amount *= (tokenUnit === 'K' ? 1_000 : 1_000_000) / rawUnitSize
  }
  if (
    showRechargePrice &&
    Number.isFinite(priceRate) &&
    Number.isFinite(usdExchangeRate) &&
    usdExchangeRate > 0
  ) {
    amount = (amount * priceRate) / usdExchangeRate
  }
  const maximumFractionDigits = Math.abs(amount) >= 1 ? 5 : 8
  return `$${new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(amount)}`
}

function PriceUnit(props: { item: PublicPriceItem; tokenUnit: TokenUnit }) {
  const { t } = useTranslation()
  if (props.item.unit === 'token') {
    return props.tokenUnit === 'K' ? `1K ${t('tokens')}` : t('1M tokens')
  }
  const unitSize = Number(props.item.unit_size)
  const unitPrefix =
    Number.isFinite(unitSize) && unitSize !== 1 ? `${unitSize} ` : ''
  return (
    <>
      {unitPrefix}
      {t(props.item.unit)}
    </>
  )
}

export function PublicPriceSummaryCompact(props: {
  summary?: PublicPriceSummary
  comparisonSummary?: PublicPriceSummary
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  emptyLabel?: string
  className?: string
  appearance?: 'default' | 'original' | 'sale'
}) {
  const { t } = useTranslation()
  const items = firstPriceItems(props.summary)
  const comparisonItems = firstPriceItems(props.comparisonSummary)
  const groupContext = commonAppliedGroupContext(items)

  if (items.length === 0) {
    return (
      <span className={cn('text-muted-foreground text-xs', props.className)}>
        {props.emptyLabel || t('Not configured')}
      </span>
    )
  }

  return (
    <div className={cn('space-y-1', props.className)}>
      {groupContext && (
        <div className='text-muted-foreground/80 flex items-center justify-between gap-2 text-[10px]'>
          <span>{t('Effective group')}</span>
          <span className='text-primary truncate font-medium'>
            {groupContext}
          </span>
        </div>
      )}
      {items.map((item, index) => {
        const condition = itemCondition(item, t)
        const comparisonItem =
          comparisonItems.find(
            (candidate) =>
              candidate.component === item.component &&
              itemCondition(candidate, t) === condition
          ) || comparisonItems[index]
        const amount = formatAmount(
          item,
          props.tokenUnit,
          props.showRechargePrice,
          props.priceRate,
          props.usdExchangeRate
        )
        const comparisonAmount = comparisonItem
          ? formatAmount(comparisonItem, props.tokenUnit)
          : ''
        return (
          <div
            key={item.key}
            className='flex min-w-0 items-baseline justify-between gap-2 text-xs'
          >
            <span className='text-muted-foreground min-w-0 truncate'>
              {condition && summaryUsesConditions(props.summary)
                ? condition
                : t(COMPONENT_LABELS[item.component] || item.component)}
            </span>
            <span className='shrink-0 text-right'>
              {comparisonAmount && (
                <del className='text-muted-foreground/70 mr-2 font-mono text-[11px] font-medium tabular-nums decoration-1'>
                  {comparisonAmount}
                </del>
              )}
              {props.appearance === 'original' ? (
                <del className='text-muted-foreground decoration-muted-foreground/70 font-mono font-medium tabular-nums decoration-1'>
                  {amount}
                </del>
              ) : (
                <span
                  className={cn(
                    'text-foreground font-mono font-semibold tabular-nums',
                    props.appearance === 'sale' &&
                      'text-primary text-sm font-bold'
                  )}
                >
                  {amount}
                </span>
              )}
              <span className='text-muted-foreground/60 ml-1 text-[10px]'>
                / <PriceUnit item={item} tokenUnit={props.tokenUnit} />
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function summaryUsesConditions(summary?: PublicPriceSummary): boolean {
  return summary?.billing_mode !== 'token'
}

export function PublicPriceComparison(props: {
  official?: PublicPriceSummary
  lowest?: PublicPriceSummary
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  lowestEmptyLabel?: string
  className?: string
}) {
  const { t } = useTranslation()
  const hasLowestPrice = firstPriceItems(props.lowest).length > 0

  return (
    <div
      className={cn(
        'bg-muted/10 rounded-lg border px-3 py-2.5',
        props.className
      )}
    >
      <div className='mb-2'>
        <div
          className={cn(
            'text-[10px] font-semibold tracking-wide uppercase',
            hasLowestPrice ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {t(hasLowestPrice ? 'Lowest item price' : 'Official Price')}
        </div>
      </div>
      {hasLowestPrice ? (
        <PublicPriceSummaryCompact
          summary={props.lowest}
          comparisonSummary={props.official}
          tokenUnit={props.tokenUnit}
          showRechargePrice={props.showRechargePrice}
          priceRate={props.priceRate}
          usdExchangeRate={props.usdExchangeRate}
          appearance='sale'
        />
      ) : (
        <>
          <PublicPriceSummaryCompact
            summary={props.official}
            tokenUnit={props.tokenUnit}
          />
          {props.lowestEmptyLabel && (
            <div className='text-muted-foreground mt-2 border-t pt-2 text-[10px]'>
              {t('Lowest item price')}: <span>{props.lowestEmptyLabel}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function PublicPriceSummaryDetails(props: {
  summary?: PublicPriceSummary
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  emptyLabel?: string
}) {
  const { t } = useTranslation()
  if (!props.summary || props.summary.items.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {props.emptyLabel || t('Not configured')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {props.summary.items.map((item) => {
        const condition = itemCondition(item, t)
        const groupContext = appliedGroupContext(item)
        return (
          <div
            key={item.key}
            className='bg-muted/15 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5'
          >
            <div className='min-w-0'>
              <div className='text-sm font-medium'>
                {t(COMPONENT_LABELS[item.component] || item.component)}
              </div>
              {condition && (
                <div className='text-muted-foreground mt-0.5 text-xs'>
                  {condition}
                  {item.upper_bound && ` · ≤ ${item.upper_bound}`}
                </div>
              )}
              {groupContext && (
                <div className='text-primary mt-1 text-[11px] font-medium'>
                  {t('Effective group')}: {groupContext}
                </div>
              )}
            </div>
            <div className='shrink-0 text-right'>
              <div className='font-mono text-sm font-semibold tabular-nums'>
                {formatAmount(
                  item,
                  props.tokenUnit,
                  props.showRechargePrice,
                  props.priceRate,
                  props.usdExchangeRate
                )}
              </div>
              <div className='text-muted-foreground text-[10px]'>
                / <PriceUnit item={item} tokenUnit={props.tokenUnit} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
