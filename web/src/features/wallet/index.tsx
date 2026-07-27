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
import { CircleCheck, CircleX, Clock3, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getSelf } from '@/lib/api'

import { AffiliateRewardsCard } from './components/affiliate-rewards-card'
import { BillingHistoryDialog } from './components/dialogs/billing-history-dialog'
import { TransferDialog } from './components/dialogs/transfer-dialog'
import { RedemptionCodeCard } from './components/redemption-code-card'
import { SubscriptionPlansCard } from './components/subscription-plans-card'
import { WalletStatsCard } from './components/wallet-stats-card'
import {
  useAffiliate,
  usePaymentReturnConfirmation,
  useRedemption,
  useTopupInfo,
} from './hooks'
import type { UserWalletData } from './types'

interface WalletProps {
  initialShowHistory?: boolean
  paymentPending?: boolean
  paymentTradeNo?: string
}

export function Wallet(props: WalletProps) {
  const { t } = useTranslation()
  const [user, setUser] = useState<UserWalletData | null>(null)
  const [userLoading, setUserLoading] = useState(true)
  const [redemptionCode, setRedemptionCode] = useState('')
  const [transferDialogOpen, setTransferDialogOpen] = useState(false)
  const [billingDialogOpen, setBillingDialogOpen] = useState(false)

  const { topupInfo } = useTopupInfo()
  const {
    affiliateLink,
    loading: affiliateLoading,
    transferQuota,
    transferring,
  } = useAffiliate()
  const { redeeming, redeemCode } = useRedemption()

  const fetchUser = useCallback(async () => {
    try {
      setUserLoading(true)
      const response = await getSelf()
      if (response.success && response.data) {
        setUser(response.data as UserWalletData)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch user data:', error)
    } finally {
      setUserLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  const paymentReturnState = usePaymentReturnConfirmation(
    props.paymentTradeNo,
    props.paymentPending === true,
    fetchUser
  )

  useEffect(() => {
    if (!props.initialShowHistory) return
    setBillingDialogOpen(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [props.initialShowHistory])

  const handleRedeem = async () => {
    const code = redemptionCode.trim()
    if (!code) return

    const success = await redeemCode(code)
    if (!success) return

    setRedemptionCode('')
    await fetchUser()
  }

  const handleTransfer = async (amount: number) => {
    const success = await transferQuota(amount)
    if (success) await fetchUser()
    return success
  }

  let paymentAlertClassName: string | undefined
  if (paymentReturnState === 'success') {
    paymentAlertClassName = 'border-emerald-500/40 bg-emerald-500/5'
  } else if (
    paymentReturnState === 'failed' ||
    paymentReturnState === 'expired'
  ) {
    paymentAlertClassName = 'border-destructive/40 bg-destructive/5'
  }

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Wallet')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='mx-auto flex w-full max-w-7xl flex-col gap-4 sm:gap-5'>
            {paymentReturnState !== 'idle' && (
              <Alert className={paymentAlertClassName}>
                {paymentReturnState === 'checking' && (
                  <Loader2 className='animate-spin' aria-hidden='true' />
                )}
                {paymentReturnState === 'success' && (
                  <CircleCheck aria-hidden='true' />
                )}
                {(paymentReturnState === 'failed' ||
                  paymentReturnState === 'expired') && (
                  <CircleX aria-hidden='true' />
                )}
                {paymentReturnState === 'timeout' && (
                  <Clock3 aria-hidden='true' />
                )}
                <AlertDescription aria-live='polite'>
                  {paymentReturnState === 'checking' &&
                    t('Confirming your payment...')}
                  {paymentReturnState === 'success' &&
                    t(
                      'Payment confirmed. Your wallet balance has been updated.'
                    )}
                  {paymentReturnState === 'failed' &&
                    t('Payment failed. No balance was added.')}
                  {paymentReturnState === 'expired' &&
                    t('Payment session expired. No balance was added.')}
                  {paymentReturnState === 'timeout' &&
                    t(
                      'Payment is still being confirmed. You can safely leave this page and check billing history later.'
                    )}
                </AlertDescription>
              </Alert>
            )}

            <WalletStatsCard
              user={user}
              loading={userLoading}
              showRechargeAction
            />

            <RedemptionCodeCard
              code={redemptionCode}
              enabled={topupInfo?.enable_redemption !== false}
              redeeming={redeeming}
              topupLink={topupInfo?.topup_link}
              onCodeChange={setRedemptionCode}
              onRedeem={handleRedeem}
            />

            <SubscriptionPlansCard
              topupInfo={topupInfo}
              userQuota={user?.quota}
              onPurchaseSuccess={fetchUser}
            />

            <AffiliateRewardsCard
              user={user}
              affiliateLink={affiliateLink}
              onTransfer={() => setTransferDialogOpen(true)}
              complianceConfirmed={
                topupInfo?.payment_compliance_confirmed !== false
              }
              loading={affiliateLoading}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TransferDialog
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
        onConfirm={handleTransfer}
        availableQuota={user?.aff_quota ?? 0}
        transferring={transferring}
      />

      <BillingHistoryDialog
        open={billingDialogOpen}
        onOpenChange={setBillingDialogOpen}
      />
    </>
  )
}
