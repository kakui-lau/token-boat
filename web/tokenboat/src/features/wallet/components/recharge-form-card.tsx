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
import { Gift, ExternalLink, Loader2, Receipt, WalletCards } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  formatCurrency,
  getDiscountLabel,
  getPaymentIcon,
  getMinTopupAmount,
  calculatePresetPricing,
} from '../lib'
import type {
  PaymentMethod,
  PresetAmount,
  TopupInfo,
  CreemProduct,
  WaffoPayMethod,
} from '../types'
import { CreemProductsSection } from './creem-products-section'

interface RechargeFormCardProps {
  topupInfo: TopupInfo | null
  presetAmounts: PresetAmount[]
  selectedPreset: number | null
  onSelectPreset: (preset: PresetAmount) => void
  topupAmount: number
  onTopupAmountChange: (amount: number) => void
  paymentAmount: number
  calculating: boolean
  onPaymentMethodSelect: (method: PaymentMethod) => void
  paymentLoading: string | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  priceRatio?: number
  usdExchangeRate?: number
  onOpenBilling?: () => void
  creemProducts?: CreemProduct[]
  enableCreemTopup?: boolean
  onCreemProductSelect?: (product: CreemProduct) => void
  enableWaffoTopup?: boolean
  waffoPayMethods?: WaffoPayMethod[]
  waffoMinTopup?: number
  onWaffoMethodSelect?: (method: WaffoPayMethod, index: number) => void
  enableWaffoPancakeTopup?: boolean
}

export function RechargeFormCard({
  topupInfo,
  presetAmounts,
  selectedPreset,
  onSelectPreset,
  topupAmount,
  onTopupAmountChange,
  paymentAmount,
  calculating,
  onPaymentMethodSelect,
  paymentLoading,
  redemptionCode,
  onRedemptionCodeChange,
  onRedeem,
  redeeming,
  topupLink,
  loading,
  priceRatio = 1,
  usdExchangeRate = 1,
  onOpenBilling,
  creemProducts,
  enableCreemTopup,
  onCreemProductSelect,
  enableWaffoTopup,
  waffoPayMethods,
  waffoMinTopup,
  onWaffoMethodSelect,
  enableWaffoPancakeTopup,
}: RechargeFormCardProps) {
  const { t } = useTranslation()
  const [localAmount, setLocalAmount] = useState(topupAmount.toString())

  useEffect(() => {
    setLocalAmount(topupAmount.toString())
  }, [topupAmount])

  const handleAmountChange = (value: string) => {
    setLocalAmount(value)
    const numValue = parseInt(value) || 0
    if (numValue >= 0) {
      onTopupAmountChange(numValue)
    }
  }

  const hasConfigurableTopup =
    topupInfo?.enable_online_topup ||
    topupInfo?.enable_stripe_topup ||
    enableWaffoTopup ||
    enableWaffoPancakeTopup
  const hasAnyTopup = hasConfigurableTopup || enableCreemTopup
  const hasStandardPaymentMethods =
    Array.isArray(topupInfo?.pay_methods) && topupInfo.pay_methods.length > 0
  const hasWaffoPaymentMethods =
    Array.isArray(waffoPayMethods) && waffoPayMethods.length > 0
  const minTopup = getMinTopupAmount(topupInfo)
  const redemptionEnabled = topupInfo?.enable_redemption !== false

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-4 p-3 sm:space-y-6 sm:p-5'>
          <div className='space-y-4 sm:space-y-6'>
            {/* Preset Amounts Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-16' />
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className='h-[72px] rounded-lg' />
                ))}
              </div>
            </div>

            {/* Custom Amount Input Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-28' />
              <Skeleton className='h-[42px] w-full' />
            </div>

            {/* Payment Methods Skeleton */}
            <div className='space-y-3'>
              <Skeleton className='h-3 w-32' />
              <div className='flex flex-wrap gap-3'>
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className='h-10 w-24 rounded-lg' />
                ))}
              </div>
            </div>
          </div>

          {/* Redemption Code Section Skeleton */}
          <div className='space-y-3 border-t pt-8'>
            <Skeleton className='h-3 w-24' />
            <div className='flex gap-2'>
              <Skeleton className='h-10 flex-1' />
              <Skeleton className='h-10 w-20' />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <TitledCard
      title={t('Add Funds')}
      description={t('Choose an amount and payment method')}
      icon={<WalletCards className='h-4 w-4' />}
      disableHoverEffect
      className='token-boat-pro-card token-boat-energy-panel'
      headerClassName='bg-background/45'
      iconClassName='bg-primary/7 text-primary'
      action={
        onOpenBilling ? (
          <Button
            variant='outline'
            size='sm'
            onClick={onOpenBilling}
            className='w-full gap-2 sm:w-auto'
          >
            <Receipt className='h-4 w-4' />
            {t('Order History')}
          </Button>
        ) : null
      }
      contentClassName='bg-muted/10 p-4 sm:p-6'
    >
      {/* Online Topup Section */}
      {hasAnyTopup ? (
        <div className='space-y-5'>
          {hasConfigurableTopup && (
            <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.44fr)] xl:items-start'>
              <div className='flex flex-col gap-5'>
                {presetAmounts.length > 0 && (
                  <div className='token-boat-glass-panel rounded-xl border p-4 sm:p-5'>
                    <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                      {t('Amount')}
                    </Label>
                    <div className='mt-4 grid grid-cols-2 gap-3 md:grid-cols-4'>
                      {presetAmounts.map((preset, index) => {
                        const discount =
                          preset.discount ||
                          topupInfo?.discount?.[preset.value] ||
                          1.0
                        const {
                          displayValue,
                          actualPrice,
                          savedAmount,
                          hasDiscount,
                        } = calculatePresetPricing(
                          preset.value,
                          priceRatio,
                          discount,
                          usdExchangeRate
                        )
                        return (
                          <Button
                            key={index}
                            variant='outline'
                            className={cn(
                              'relative flex min-h-20 flex-col items-start overflow-hidden rounded-xl px-3.5 py-3 text-left whitespace-normal transition-all sm:min-h-[88px] sm:p-4',
                              selectedPreset === preset.value
                                ? 'border-primary/60 bg-primary/[0.07] shadow-sm'
                                : 'border-muted bg-card/75 hover:border-primary/30 hover:bg-primary/[0.03]'
                            )}
                            onClick={() => onSelectPreset(preset)}
                          >
                            {selectedPreset === preset.value && (
                              <span className='bg-primary absolute inset-x-0 top-0 h-0.5' />
                            )}
                            <div className='flex w-full items-center justify-between'>
                              <div className='text-base font-semibold sm:text-lg'>
                                {formatNumber(displayValue)}
                              </div>
                              {hasDiscount && (
                                <div className='bg-success/10 text-success rounded-full px-2 py-0.5 text-[11px] font-medium'>
                                  {getDiscountLabel(discount)}
                                </div>
                              )}
                            </div>
                            <div className='text-muted-foreground mt-1.5 w-full text-xs sm:mt-2'>
                              Pay {formatCurrency(actualPrice)}
                              {hasDiscount && savedAmount > 0 && (
                                <span className='text-success'>
                                  {' '}
                                  • Save {formatCurrency(savedAmount)}
                                </span>
                              )}
                            </div>
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className='token-boat-glass-panel rounded-xl border p-4 sm:p-5'>
                  <Label
                    htmlFor='topup-amount'
                    className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
                  >
                    {t('Custom Amount')}
                  </Label>
                  <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.55fr)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'>
                    <Input
                      id='topup-amount'
                      type='number'
                      value={localAmount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      min={minTopup}
                      placeholder={`Minimum ${minTopup}`}
                      className='border-primary/15 bg-background/75 h-11 text-base shadow-xs sm:h-12 sm:text-lg'
                    />
                    <div className='border-primary/15 bg-primary/[0.035] flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 shadow-xs lg:min-w-56'>
                      <span className='text-muted-foreground truncate text-xs'>
                        {t('Amount to pay:')}
                      </span>
                      {calculating ? (
                        <Skeleton className='h-5 w-16' />
                      ) : (
                        <span className='text-sm font-semibold'>
                          {formatCurrency(paymentAmount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className='flex flex-col gap-5'>
                <div className='token-boat-glass-panel rounded-xl border p-4 sm:p-5'>
                  <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                    {t('Payment Method')}
                  </Label>
                  {hasStandardPaymentMethods ? (
                    <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                      {topupInfo?.pay_methods?.map((method) => {
                        const minTopup = method.min_topup || 0
                        const disabled = minTopup > topupAmount
                        const disabledReason = disabled
                          ? t('Minimum topup amount: {{amount}}', {
                              amount: minTopup,
                            })
                          : undefined
                        const disabledLabel = disabled
                          ? `${t('Minimum:')} ${minTopup}`
                          : undefined

                        const button = (
                          <Button
                            key={method.type}
                            variant='outline'
                            onClick={() => onPaymentMethodSelect(method)}
                            disabled={disabled || !!paymentLoading}
                            title={disabledReason}
                            aria-label={
                              disabledReason
                                ? `${method.name}. ${disabledReason}`
                                : method.name
                            }
                            className='border-muted bg-card/75 hover:border-primary/30 hover:bg-primary/[0.03] min-h-16 min-w-0 justify-start gap-2 rounded-xl px-3.5 py-2.5 text-left'
                          >
                            {paymentLoading === method.type ? (
                              <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                              getPaymentIcon(
                                method.type,
                                'h-4 w-4',
                                method.icon,
                                method.name
                              )
                            )}
                            <span className='flex min-w-0 flex-col items-start gap-0.5'>
                              <span className='max-w-full truncate'>
                                {method.name}
                              </span>
                              {disabledLabel && (
                                <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                  {disabledLabel}
                                </span>
                              )}
                            </span>
                          </Button>
                        )

                        return disabled ? (
                          <TooltipProvider key={method.type}>
                            <Tooltip>
                              <TooltipTrigger render={button}></TooltipTrigger>
                              <TooltipContent>{disabledReason}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          button
                        )
                      })}
                    </div>
                  ) : hasWaffoPaymentMethods ? null : (
                    <Alert>
                      <AlertDescription>
                        {t(
                          'No payment methods available. Please contact administrator.'
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {enableWaffoTopup &&
                  hasWaffoPaymentMethods &&
                  onWaffoMethodSelect && (
                    <div className='token-boat-glass-panel rounded-xl border p-4 sm:p-5'>
                      <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
                        {t('Waffo Payment')}
                      </Label>
                      <div className='mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                        {waffoPayMethods?.map((method, index) => {
                          const loadingKey = `waffo-${index}`
                          const waffoMin = waffoMinTopup || 0
                          const belowMin = waffoMin > topupAmount
                          const disabledReason = belowMin
                            ? t('Minimum topup amount: {{amount}}', {
                                amount: waffoMin,
                              })
                            : undefined
                          const disabledLabel = belowMin
                            ? `${t('Minimum:')} ${waffoMin}`
                            : undefined

                          const button = (
                            <Button
                              key={`${method.name}-${index}`}
                              variant='outline'
                              onClick={() => onWaffoMethodSelect(method, index)}
                              disabled={belowMin || !!paymentLoading}
                              title={disabledReason}
                              aria-label={
                                disabledReason
                                  ? `${method.name}. ${disabledReason}`
                                  : method.name
                              }
                              className='border-muted bg-card/75 hover:border-primary/30 hover:bg-primary/[0.03] min-h-16 min-w-0 justify-start gap-2 rounded-xl px-3.5 py-2.5 text-left'
                            >
                              {paymentLoading === loadingKey ? (
                                <Loader2 className='h-4 w-4 animate-spin' />
                              ) : method.icon ? (
                                <img
                                  src={method.icon}
                                  alt={method.name}
                                  className='h-4 w-4 object-contain'
                                />
                              ) : (
                                getPaymentIcon('waffo')
                              )}
                              <span className='flex min-w-0 flex-col items-start gap-0.5'>
                                <span className='max-w-full truncate'>
                                  {method.name}
                                </span>
                                {disabledLabel && (
                                  <span className='text-muted-foreground max-w-full truncate text-[11px] leading-4 font-normal'>
                                    {disabledLabel}
                                  </span>
                                )}
                              </span>
                            </Button>
                          )

                          return belowMin ? (
                            <TooltipProvider key={`${method.name}-${index}`}>
                              <Tooltip>
                                <TooltipTrigger
                                  render={button}
                                ></TooltipTrigger>
                                <TooltipContent>
                                  {disabledReason}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            button
                          )
                        })}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <Alert>
          <AlertDescription>
            {t(
              'Online topup is not enabled. Please use redemption code or contact administrator.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Creem Products Section */}
      {enableCreemTopup &&
        Array.isArray(creemProducts) &&
        creemProducts.length > 0 &&
        onCreemProductSelect && (
          <div className='token-boat-glass-panel space-y-3 rounded-xl border p-4 sm:p-5'>
            <Label className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Creem Payment')}
            </Label>
            <CreemProductsSection
              products={creemProducts}
              onProductSelect={onCreemProductSelect}
            />
          </div>
        )}

      {/* Redemption Code Section */}
      {redemptionEnabled ? (
        <div className='token-boat-glass-panel space-y-3 rounded-xl border p-4 sm:p-5'>
          <div className='flex items-center gap-2'>
            <Gift className='text-muted-foreground h-4 w-4' />
            <Label
              htmlFor='redemption-code'
              className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
            >
              {t('Have a Code?')}
            </Label>
          </div>
          <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
            <Input
              id='redemption-code'
              value={redemptionCode}
              onChange={(e) => onRedemptionCodeChange(e.target.value)}
              placeholder={t('Enter your redemption code')}
              className='h-9 min-w-0'
            />
            <Button
              onClick={onRedeem}
              disabled={redeeming}
              variant='outline'
              className='h-9 px-4'
            >
              {redeeming && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Redeem')}
            </Button>
          </div>
          {topupLink && (
            <p className='text-muted-foreground text-xs'>
              {t('Need a redemption code?')}{' '}
              <a
                href={topupLink}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
              >
                {t('Get one here')}
                <ExternalLink className='h-3 w-3' />
              </a>
            </p>
          )}
        </div>
      ) : (
        <Alert className='border-t'>
          <AlertDescription>
            {t(
              'Redemption codes are disabled until the administrator confirms compliance terms.'
            )}
          </AlertDescription>
        </Alert>
      )}
    </TitledCard>
  )
}
