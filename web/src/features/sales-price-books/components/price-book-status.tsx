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
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { SalesPriceBookStatus } from '../types'

type PriceBookStatusBadgesProps = {
  status: SalesPriceBookStatus
  isTocDefault: boolean
}

function priceBookStatusLabel(status: SalesPriceBookStatus, t: TFunction) {
  switch (status) {
    case 'draft':
      return t('Draft')
    case 'enabled':
      return t('Enabled')
    case 'disabled':
      return t('Disabled')
    case 'archived':
      return t('Archived')
  }
}

export function PriceBookStatusBadges(props: PriceBookStatusBadgesProps) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Badge variant={props.status === 'enabled' ? 'default' : 'outline'}>
        {priceBookStatusLabel(props.status, t)}
      </Badge>
      {props.isTocDefault ? (
        <Badge variant='secondary'>{t('TOC default')}</Badge>
      ) : null}
    </div>
  )
}
