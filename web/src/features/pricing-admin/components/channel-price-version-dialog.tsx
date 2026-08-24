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

import { formatPurchaseDiscount } from '../lib/purchase-discount'
import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'
import { PurchasePriceComparison } from './purchase-price-comparison'

type ChannelPriceVersionDialogProps = {
  kind: 'purchase'
  version: PurchasePriceVersion | null
  officialVersion?: OfficialPriceVersion
  onOpenChange: (open: boolean) => void
}

export function ChannelPriceVersionDialog(
  props: ChannelPriceVersionDialogProps
) {
  const { t } = useTranslation()
  const version = props.version
  let officialVersionLabel = '—'
  if (props.officialVersion) {
    officialVersionLabel =
      `v${props.officialVersion.version} · #${props.officialVersion.id}` +
      ` · ${t(props.officialVersion.status)}`
  } else if (version?.official_price_version_id) {
    officialVersionLabel = `#${version.official_price_version_id}`
  }
  let discountLabel = '—'
  if (version?.pricing_mode === 'official_ratio' && version.purchase_discount) {
    discountLabel = formatPurchaseDiscount(version.purchase_discount, t)
  } else if (version?.pricing_mode === 'component_ratio') {
    discountLabel = t('Component Discounts')
  } else if (version?.pricing_mode === 'fixed_unit_price') {
    discountLabel = t('Fixed Prices')
  }

  return (
    <Dialog open={version !== null} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Purchase Version Details')} · v{version?.version}
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
                <Detail key={label} label={label} value={value || '—'} />
              ))}
            </div>
            <PurchasePriceComparison
              purchase={version}
              officialVersion={props.officialVersion}
            />
            <div className='grid gap-3 text-sm sm:grid-cols-2'>
              <Detail label={t('Cost Basis')} value={t(version.pricing_mode)} />
              <Detail
                label={t('Official Version')}
                value={officialVersionLabel}
              />
              <Detail label={t('Purchase Discount')} value={discountLabel} />
              <Detail
                label={t('Quote ID')}
                value={version.quote_reference || '—'}
              />
              <Detail
                label={t('Contract ID')}
                value={version.contract_reference || '—'}
              />
              <Detail
                label={t('Conditions')}
                value={version.conditions || '—'}
              />
            </div>
            <section className='space-y-2'>
              <h3 className='text-sm font-medium'>{t('Billing Expression')}</h3>
              <pre className='bg-muted/50 max-h-52 overflow-auto rounded-lg border p-3 font-mono text-xs whitespace-pre-wrap'>
                {version.purchase_billing_expr || '—'}
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
