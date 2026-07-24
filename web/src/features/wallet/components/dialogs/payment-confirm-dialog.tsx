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
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
} from '@/lib/currency'

import { DEFAULT_DISCOUNT_RATE } from '../../constants'
import { getPaymentIcon } from '../../lib'
import type { PaymentMethod } from '../../types'

interface PaymentConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  topupAmount: number
  paymentAmount: number
  paymentMethod: PaymentMethod | undefined
  calculating: boolean
  processing: boolean
  discountRate?: number
  usdExchangeRate?: number
}

export function PaymentConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  topupAmount,
  paymentAmount,
  paymentMethod,
  calculating,
  processing,
  discountRate = DEFAULT_DISCOUNT_RATE,
}: PaymentConfirmDialogProps) {
  const { t } = useTranslation()
  const hasDiscount = discountRate > 0 && discountRate < 1 && paymentAmount > 0
  const originalAmount = hasDiscount ? paymentAmount / discountRate : 0
  const discountAmount = hasDiscount ? originalAmount - paymentAmount : 0

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='gap-0 overflow-hidden p-0 max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <AlertDialogHeader className='grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-b px-5 py-5 text-left sm:place-items-start'>
          <span className='bg-primary/10 text-primary row-span-2 flex size-10 items-center justify-center rounded-lg'>
            <CreditCard className='size-5' />
          </span>
          <AlertDialogTitle className='text-lg font-semibold tracking-tight'>
            {t('Confirm Payment')}
          </AlertDialogTitle>
          <AlertDialogDescription className='text-sm'>
            {t('Review your payment details')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className='space-y-5 px-5 py-5'>
          <div className='border-border/70 bg-muted/20 rounded-lg border p-4'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-muted-foreground text-sm'>
                {t('Topup Amount')}
              </span>
              <span className='font-semibold tabular-nums'>
                {formatCurrencyFromUSD(topupAmount)}
              </span>
            </div>

            <div className='border-border my-3 border-t border-dashed' />

            <div className='flex items-end justify-between gap-4'>
              <span className='pb-1 text-sm font-medium'>{t('You Pay')}</span>
              <div className='text-right'>
                {hasDiscount && !calculating && (
                  <span className='text-muted-foreground mb-0.5 block text-xs tabular-nums line-through'>
                    {formatLocalCurrencyAmount(originalAmount)}
                  </span>
                )}
                {calculating ? (
                  <Skeleton className='h-8 w-28' />
                ) : (
                  <span className='text-2xl font-semibold tracking-tight tabular-nums'>
                    {formatLocalCurrencyAmount(paymentAmount)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {hasDiscount && !calculating && (
            <div className='flex items-center justify-between rounded-lg bg-emerald-500/8 px-3.5 py-3 text-sm'>
              <span className='text-emerald-700 dark:text-emerald-300'>
                {t('You save')}
              </span>
              <span className='font-semibold text-emerald-600 tabular-nums dark:text-emerald-400'>
                {formatLocalCurrencyAmount(discountAmount)}
              </span>
            </div>
          )}

          <div>
            <p className='text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase'>
              {t('Payment Method')}
            </p>
            <div className='border-border/70 flex items-center gap-3 rounded-lg border px-3.5 py-3'>
              <span className='bg-background flex size-9 items-center justify-center rounded-md border'>
                {getPaymentIcon(
                  paymentMethod?.type,
                  'size-5',
                  paymentMethod?.icon,
                  paymentMethod?.name
                )}
              </span>
              <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                {paymentMethod?.name}
              </span>
              <ShieldCheck className='text-primary size-4' />
            </div>
          </div>

          <p className='text-muted-foreground flex items-center justify-center gap-1.5 text-xs'>
            <ShieldCheck className='text-primary size-3.5' />
            {t('Secure payment')}
          </p>
        </div>

        <AlertDialogFooter className='bg-muted/30 m-0 grid grid-cols-2 gap-2 rounded-none border-t p-4 sm:grid sm:grid-cols-2'>
          <AlertDialogCancel className='w-full' disabled={processing}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            className='w-full'
            onClick={onConfirm}
            disabled={processing}
          >
            {processing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Confirm Payment')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
