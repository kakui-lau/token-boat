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

import { StatusBadge, type StatusVariant } from '@/components/status-badge'

import type { PricingModel } from '../types'

interface ModelBillingModeBadgeProps {
  model: PricingModel
  className?: string
}

export function ModelBillingModeBadge(props: ModelBillingModeBadgeProps) {
  const { t } = useTranslation()
  let label = t('Per Request')
  let variant: StatusVariant = 'purple'

  const structuredBillingMode =
    props.model.lowest_price?.billing_mode ||
    props.model.official_price?.billing_mode

  if (structuredBillingMode) {
    const labels: Record<string, string> = {
      token: 'Token-based',
      request: 'Per Request',
      image: 'Image',
      character: 'Character',
      audio_duration: 'Audio duration',
      video_duration: 'Video duration',
      mixed: 'Mixed',
    }
    label = t(labels[structuredBillingMode] || structuredBillingMode)
    variant = structuredBillingMode === 'token' ? 'info' : 'purple'
  } else if (!props.model.available) {
    label = t('Not configured')
    variant = 'neutral'
  }

  return (
    <StatusBadge
      label={label}
      variant={variant}
      copyable={false}
      size='sm'
      className={props.className}
    />
  )
}
