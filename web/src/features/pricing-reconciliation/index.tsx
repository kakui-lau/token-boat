import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { PricingReconciliationPanel } from '@/features/pricing-admin/components/pricing-reconciliation-panel'

export function PricingReconciliationPage() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Pricing Reconciliation')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='h-full overflow-auto'>
          <PricingReconciliationPanel />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
