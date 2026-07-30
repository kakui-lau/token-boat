import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { PricingCircuitPanel } from '@/features/pricing-admin/components/pricing-circuit-panel'

export function CircuitAnalysisPage() {
  const { t } = useTranslation()

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>{t('Circuit Analysis')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='h-full overflow-auto'>
          <PricingCircuitPanel />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
