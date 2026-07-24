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
import { ExternalLink, Gift, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TitledCard } from '@/components/ui/titled-card'

type RedemptionCodeCardProps = {
  code: string
  enabled: boolean
  redeeming: boolean
  topupLink?: string
  onCodeChange: (code: string) => void
  onRedeem: () => void
}

export function RedemptionCodeCard(props: RedemptionCodeCardProps) {
  const { t } = useTranslation()

  return (
    <TitledCard
      title={t('Redemption Code')}
      description={t('Enter your redemption code')}
      icon={<Gift className='size-4' />}
      iconTone='warning'
      disableHoverEffect
      contentClassName='space-y-4'
    >
      {props.enabled ? (
        <>
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
            <Input
              aria-label={t('Redemption Code')}
              value={props.code}
              onChange={(event) => props.onCodeChange(event.target.value)}
              placeholder={t('Enter your redemption code')}
              className='h-11'
            />
            <Button
              className='h-11 px-6'
              disabled={!props.code.trim() || props.redeeming}
              onClick={props.onRedeem}
            >
              {props.redeeming && <Loader2 className='size-4 animate-spin' />}
              {t('Redeem')}
            </Button>
          </div>

          {props.topupLink && (
            <a
              href={props.topupLink}
              target='_blank'
              rel='noopener noreferrer'
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors'
            >
              {t('Need a redemption code?')} {t('Get one here')}
              <ExternalLink className='size-3' />
            </a>
          )}
        </>
      ) : (
        <Alert>
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
