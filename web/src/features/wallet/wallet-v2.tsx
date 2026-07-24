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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'

import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { PaymentConfirmDialog } from './components/dialogs/payment-confirm-dialog'
import { RechargeCheckoutV2 } from './components/recharge-checkout-v2'
import { DEFAULT_DISCOUNT_RATE, PAYMENT_TYPES } from './constants'
import {
  usePayment,
  useTopupInfo,
  useWaffoPancakePayment,
  useWaffoPayment,
} from './hooks'
import {
  dispatchSelectedPayment,
  getDefaultPaymentType,
  getMinTopupAmount,
} from './lib'
import type { PaymentMethod, PresetAmount } from './types'

type WalletV2Props = {
  initialShowHistory?: boolean
}

export function WalletV2(props: WalletV2Props) {
  const { t } = useTranslation()
  const [topupAmount, setTopupAmount] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<PaymentMethod>()
  const [selectedWaffoMethodIndex, setSelectedWaffoMethodIndex] = useState<
    number | null
  >(null)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

  const { status } = useStatus()
  const { currency } = useSystemConfig()
  const { topupInfo, presetAmounts, loading } = useTopupInfo()
  const {
    amount: paymentAmount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
  } = usePayment()
  const { processing: waffoProcessing, processWaffoPayment } = useWaffoPayment()
  const { processing: pancakeProcessing, processWaffoPancakePayment } =
    useWaffoPancakePayment()

  const effectiveUsdExchangeRate = useMemo(
    () =>
      currency?.quotaDisplayType === 'USD' ? 1 : currency?.usdExchangeRate || 1,
    [currency?.quotaDisplayType, currency?.usdExchangeRate]
  )

  useEffect(() => {
    if (!props.initialShowHistory) return
    setBillingDialogOpen(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [props.initialShowHistory])

  useEffect(() => {
    if (!topupInfo || topupAmount !== 0) return
    const initialAmount = getMinTopupAmount(topupInfo)
    const initialPaymentType = getDefaultPaymentType(topupInfo)
    setTopupAmount(initialAmount)
    calculatePaymentAmount(initialAmount, initialPaymentType)
  }, [calculatePaymentAmount, topupAmount, topupInfo])

  const handleSelectPreset = (preset: PresetAmount) => {
    setSelectedPreset(preset.value)
    setTopupAmount(preset.value)
    calculatePaymentAmount(
      preset.value,
      selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
    )
  }

  const handleAmountChange = (amount: number) => {
    setSelectedPreset(null)
    setTopupAmount(amount)
    calculatePaymentAmount(
      amount,
      selectedPaymentMethod?.type || getDefaultPaymentType(topupInfo)
    )
  }

  const handlePaymentMethodSelect = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method)
    if (method.type === PAYMENT_TYPES.WAFFO) {
      const methodIndex =
        topupInfo?.waffo_pay_methods?.findIndex(
          (candidate) => candidate.name === method.name
        ) ?? -1
      setSelectedWaffoMethodIndex(methodIndex >= 0 ? methodIndex : null)
    } else {
      setSelectedWaffoMethodIndex(null)
    }
    calculatePaymentAmount(topupAmount, method.type)
  }

  const handleCheckout = () => {
    if (!selectedPaymentMethod) return
    if (topupAmount < getMinTopupAmount(topupInfo)) return
    setConfirmDialogOpen(true)
  }

  const handlePaymentConfirm = useCallback(async () => {
    if (!selectedPaymentMethod) return
    const success = await dispatchSelectedPayment(
      selectedPaymentMethod,
      topupAmount,
      selectedWaffoMethodIndex,
      {
        regular: processPayment,
        waffo: processWaffoPayment,
        waffoPancake: processWaffoPancakePayment,
      }
    )
    if (success) setConfirmDialogOpen(false)
  }, [
    processPayment,
    processWaffoPancakePayment,
    processWaffoPayment,
    selectedPaymentMethod,
    selectedWaffoMethodIndex,
    topupAmount,
  ])

  const discountRate =
    topupInfo?.discount?.[topupAmount] || DEFAULT_DISCOUNT_RATE

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Recharge')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto w-full max-w-7xl py-1'>
            <RechargeCheckoutV2
              topupInfo={topupInfo}
              presetAmounts={presetAmounts}
              selectedPreset={selectedPreset}
              topupAmount={topupAmount}
              paymentAmount={paymentAmount}
              selectedPaymentMethod={selectedPaymentMethod}
              paymentLoading={null}
              calculating={calculating}
              loading={loading}
              priceRatio={(status?.price as number) || 1}
              usdExchangeRate={effectiveUsdExchangeRate}
              waffoPayMethods={topupInfo?.waffo_pay_methods}
              onSelectPreset={handleSelectPreset}
              onTopupAmountChange={handleAmountChange}
              onSelectPaymentMethod={handlePaymentMethodSelect}
              onCheckout={handleCheckout}
              onOpenBilling={() => setBillingDialogOpen(true)}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <PaymentConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        onConfirm={handlePaymentConfirm}
        topupAmount={topupAmount}
        paymentAmount={paymentAmount}
        paymentMethod={selectedPaymentMethod}
        calculating={calculating}
        processing={processing || waffoProcessing || pancakeProcessing}
        discountRate={discountRate}
        usdExchangeRate={effectiveUsdExchangeRate}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />
    </>
  )
}
