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

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type VersionListItem = {
  id: number
  version: number
  status: string
  currency: string
  input_unit_price?: string
  output_unit_price?: string
}

type VersionListProps = {
  items: VersionListItem[]
  isPublishing: boolean
  isSuspending: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
}

export function VersionList(props: VersionListProps) {
  const { t } = useTranslation()
  if (props.items.length === 0) {
    return (
      <p className='text-muted-foreground rounded-lg border border-dashed p-4 text-center'>
        {t('No price versions yet')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {props.items.map((item) => (
        <div
          key={item.id}
          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
        >
          <div className='min-w-0 space-y-1'>
            <div className='flex items-center gap-2'>
              <span className='font-medium'>
                {t('Version')} {item.version}
              </span>
              <Badge variant={item.status === 'active' ? 'default' : 'outline'}>
                {t(item.status)}
              </Badge>
            </div>
            {item.input_unit_price || item.output_unit_price ? (
              <p className='text-muted-foreground text-xs'>
                {t('Input')}: {item.input_unit_price || '—'} {item.currency}
                {' · '}
                {t('Output')}: {item.output_unit_price || '—'} {item.currency}
              </p>
            ) : null}
          </div>
          {item.status === 'draft' ? (
            <Button
              size='sm'
              disabled={props.isPublishing}
              onClick={() => props.onPublish(item.id)}
            >
              {t('Publish')}
            </Button>
          ) : null}
          {item.status === 'active' ? (
            <Button
              size='sm'
              variant='destructive'
              disabled={props.isSuspending}
              onClick={() => props.onSuspend(item.id)}
            >
              {t('Suspend')}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}
