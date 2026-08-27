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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { SalesPriceBook } from '../types'

type PriceBookSummaryProps = {
  book: SalesPriceBook
}

export function PriceBookSummary(props: PriceBookSummaryProps) {
  const { t } = useTranslation()
  const currentVersion = props.book.current_version

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <CardTitle>{props.book.name}</CardTitle>
          <Badge>{props.book.audience.toUpperCase()}</Badge>
          <Badge variant='outline'>{t('Selected price book')}</Badge>
        </div>
        <CardDescription>
          {currentVersion
            ? t('Actual customer billing is using version v{{version}}.', {
                version: currentVersion.version,
              })
            : t('This price book does not have an active version yet.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <dl className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <div className='bg-muted/40 rounded-lg border p-4'>
            <dt className='text-muted-foreground text-sm'>{t('Audience')}</dt>
            <dd className='mt-1 text-lg font-semibold'>
              {props.book.audience.toUpperCase()}
            </dd>
          </div>
          <div className='bg-muted/40 rounded-lg border p-4'>
            <dt className='text-muted-foreground text-sm'>
              {t('Current active version')}
            </dt>
            <dd className='mt-1 text-lg font-semibold'>
              {currentVersion ? `v${currentVersion.version}` : '—'}
            </dd>
          </div>
          <div className='bg-muted/40 rounded-lg border p-4'>
            <dt className='text-muted-foreground text-sm'>{t('Models')}</dt>
            <dd className='mt-1 text-lg font-semibold'>
              {props.book.model_count}
            </dd>
          </div>
          <div className='bg-muted/40 rounded-lg border p-4'>
            <dt className='text-muted-foreground text-sm'>
              {t('Explicit user assignments')}
            </dt>
            <dd className='mt-1 text-lg font-semibold'>
              {props.book.assigned_users}
            </dd>
          </div>
        </dl>
        <p className='text-muted-foreground text-sm'>
          {props.book.audience === 'toc'
            ? t(
                'TOC users use the default price book automatically, so zero explicit assignments is normal.'
              )
            : t('TOB users receive this price only after being assigned.')}
        </p>
      </CardContent>
    </Card>
  )
}
