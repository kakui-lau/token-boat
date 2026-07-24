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
import { Check, Loader2, ReceiptText, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
} from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  calculatePresetPricing,
  getDiscountLabel,
  getMinTopupAmount,
  getPaymentIcon,
} from '../lib'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  WaffoPayMethod,
} from '../types'

type RechargeCheckoutV2Props = {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  topupAmount: number
  paymentAmount: number
  selectedPaymentMethod?: PaymentMethod
  paymentLoading: string | null
  calculating: boolean
  loading: boolean
  priceRatio: number
  usdExchangeRate: number
  waffoPayMethods?: WaffoPayMethod[]
  onSelectPreset: (preset: PresetAmount) => void
  onTopupAmountChange: (amount: number) => void
  onSelectPaymentMethod: (method: PaymentMethod) => void
  onCheckout: () => void
  onOpenBilling: () => void
}

export function RechargeCheckoutV2(props: RechargeCheckoutV2Props) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(props.topupAmount.toString())

  useEffect(() => {
    setLocalAmount(props.topupAmount.toString())
  }, [props.topupAmount])

  const handleAmountChange = (value: string) => {
    const integerPart = value.split(/[.,]/, 1)[0] ?? ''
    const normalizedValue = integerPart.replaceAll(/\D/g, '')
    setLocalAmount(normalizedValue)
    props.onTopupAmountChange(Number.parseInt(normalizedValue, 10) || 0)
  }

  if (props.loading) {
    return (
      <div className='bg-card rounded-xl border'>
        <div className='space-y-3 border-b p-5'>
          <Skeleton className='h-7 w-40' />
          <Skeleton className='h-4 w-64' />
        </div>
        <div className='grid gap-6 p-5 lg:grid-cols-2'>
          <Skeleton className='h-[440px] rounded-xl' />
          <Skeleton className='h-[440px] rounded-xl' />
        </div>
      </div>
    )
  }

  const standardMethods = props.topupInfo?.pay_methods ?? []
  const waffoMethods = (props.waffoPayMethods ?? []).map((method) => ({
    name: method.name,
    type: 'waffo',
    icon: method.icon,
  }))
  const paymentMethods = [...standardMethods, ...waffoMethods]
  const minTopup = getMinTopupAmount(props.topupInfo)
  const discount =
    props.topupInfo?.discount?.[props.topupAmount] ??
    props.presetAmounts.find((preset) => preset.value === props.topupAmount)
      ?.discount ??
    1
  const pricing = calculatePresetPricing(
    props.topupAmount,
    props.priceRatio,
    discount,
    props.usdExchangeRate
  )
  const canCheckout =
    Boolean(props.selectedPaymentMethod) &&
    props.topupAmount >= minTopup &&
    !props.calculating &&
    !props.paymentLoading

  return (
    <section
      aria-labelledby='wallet-v2-title'
      className='border-border/70 bg-card overflow-hidden rounded-xl border shadow-xs'
    >
      <header className='border-border/70 flex flex-col gap-4 border-b px-5 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-7'>
        <div>
          <h2
            id='wallet-v2-title'
            className='text-xl font-semibold tracking-tight'
          >
            {t('Add Funds')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Choose an amount and payment method')}
          </p>
        </div>
        <Button
          variant='ghost'
          size='sm'
          className='gap-2 self-start sm:self-auto'
          onClick={props.onOpenBilling}
        >
          <ReceiptText className='size-4' />
          {t('Order History')}
        </Button>
      </header>

      <div className='border-border/70 border-b px-5 py-5 lg:px-7'>
        <ol className='grid grid-cols-3 gap-3' aria-label={t('Payment steps')}>
          {[t('Amount'), t('Payment Method'), t('Confirm Payment')].map(
            (label, index) => {
              const active = index < 2
              return (
                <li
                  key={label}
                  className='flex min-w-0 items-center gap-2 sm:gap-3'
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      'truncate text-xs font-medium sm:text-sm',
                      active ? 'text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                  {index < 2 && (
                    <span
                      aria-hidden
                      className={cn(
                        'hidden h-px min-w-4 flex-1 sm:block',
                        active ? 'bg-primary/60' : 'bg-border'
                      )}
                    />
                  )}
                </li>
              )
            }
          )}
        </ol>
      </div>

      <div className='grid lg:grid-cols-2'>
        <div className='border-border/70 space-y-6 border-b p-5 lg:border-r lg:border-b-0 lg:p-7'>
          <div className='space-y-3'>
            <Label className='text-sm font-semibold'>{t('Amount')}</Label>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
              {props.presetAmounts.map((preset) => {
                const presetDiscount =
                  preset.discount ||
                  props.topupInfo?.discount?.[preset.value] ||
                  1
                const presetPricing = calculatePresetPricing(
                  preset.value,
                  props.priceRatio,
                  presetDiscount,
                  props.usdExchangeRate
                )
                const selected = props.selectedPreset === preset.value

                return (
                  <button
                    key={preset.value}
                    type='button'
                    aria-pressed={selected}
                    className={cn(
                      'relative min-h-24 rounded-lg border px-4 py-3 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border/80 bg-background hover:border-primary/45 hover:bg-muted/30'
                    )}
                    onClick={() => props.onSelectPreset(preset)}
                  >
                    <span className='block text-lg font-semibold tabular-nums'>
                      {formatCurrencyFromUSD(preset.value)}
                    </span>
                    <span className='text-muted-foreground mt-1 block text-xs tabular-nums'>
                      {t('Pay')}{' '}
                      {formatLocalCurrencyAmount(presetPricing.actualPrice)}
                    </span>
                    {presetPricing.hasDiscount && (
                      <span className='mt-2 inline-flex rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400'>
                        {getDiscountLabel(presetDiscount)}
                      </span>
                    )}
                    {selected && (
                      <span className='bg-primary text-primary-foreground absolute top-2 right-2 flex size-5 items-center justify-center rounded-full'>
                        <Check className='size-3' />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='wallet-v2-amount'>{t('Custom Amount')}</Label>
            <div className='relative'>
              <span className='text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 text-xs'>
                {t('Quota')}
              </span>
              <Input
                id='wallet-v2-amount'
                value={localAmount}
                inputMode='numeric'
                pattern='[0-9]*'
                className='h-11 pr-16 text-base tabular-nums'
                placeholder={`${t('Minimum:')} ${minTopup}`}
                onChange={(event) => handleAmountChange(event.target.value)}
              />
            </div>
            <p className='text-muted-foreground text-xs'>
              {t('Minimum topup amount: {{amount}}', { amount: minTopup })}
            </p>
          </div>
        </div>

        <div className='flex flex-col p-5 lg:p-7'>
          <div className='space-y-3'>
            <Label className='text-sm font-semibold'>
              {t('Payment Method')}
            </Label>
            <div className='space-y-2'>
              {paymentMethods.map((method, index) => {
                const methodKey = `${method.type}-${index}`
                const selected =
                  props.selectedPaymentMethod?.type === method.type &&
                  props.selectedPaymentMethod?.name === method.name
                const methodMinTopup =
                  'min_topup' in method ? method.min_topup || 0 : 0
                const disabled = methodMinTopup > props.topupAmount

                return (
                  <button
                    key={methodKey}
                    type='button'
                    disabled={disabled}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border/80 hover:border-primary/40 hover:bg-muted/30',
                      disabled && 'cursor-not-allowed opacity-50'
                    )}
                    onClick={() => props.onSelectPaymentMethod(method)}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-primary' : 'border-border'
                      )}
                    >
                      {selected && (
                        <span className='bg-primary size-2 rounded-full' />
                      )}
                    </span>
                    <span className='bg-background flex size-9 shrink-0 items-center justify-center rounded-lg border'>
                      {getPaymentIcon(
                        method.type,
                        'size-5',
                        method.icon,
                        method.name
                      )}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>
                        {method.name}
                      </span>
                      {methodMinTopup > 0 && (
                        <span className='text-muted-foreground block text-xs'>
                          {t('Minimum:')} {methodMinTopup}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className='border-border/70 mt-7 border-t pt-6'>
            <h3 className='text-sm font-semibold'>{t('Order Summary')}</h3>
            <dl className='mt-4 space-y-3 text-sm'>
              <div className='flex items-center justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Top-up Amount')}</dt>
                <dd className='font-medium tabular-nums'>
                  {formatCurrencyFromUSD(props.topupAmount)}
                </dd>
              </div>
              <div className='flex items-center justify-between gap-4'>
                <dt className='text-muted-foreground'>{t('Discount')}</dt>
                <dd className='font-medium text-emerald-600 tabular-nums dark:text-emerald-400'>
                  {pricing.savedAmount > 0
                    ? `−${formatLocalCurrencyAmount(pricing.savedAmount)}`
                    : '—'}
                </dd>
              </div>
              <div className='border-border flex items-end justify-between gap-4 border-t border-dashed pt-4'>
                <dt className='font-semibold'>{t('Amount to pay:')}</dt>
                <dd className='text-2xl font-semibold tracking-tight tabular-nums'>
                  {props.calculating ? (
                    <Skeleton className='h-8 w-28' />
                  ) : (
                    formatLocalCurrencyAmount(props.paymentAmount)
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className='mt-auto pt-7'>
            <Button
              size='lg'
              className='h-12 w-full text-base'
              disabled={!canCheckout}
              onClick={props.onCheckout}
            >
              {props.paymentLoading ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                `${t('Pay Now')} · ${formatLocalCurrencyAmount(
                  props.paymentAmount
                )}`
              )}
            </Button>
            <p className='text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-xs'>
              <ShieldCheck className='text-primary size-3.5' />
              {t('Secure payment')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
