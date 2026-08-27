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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

import type {
  SalesPriceBook,
  SalesPriceBookItem,
  SalesPriceBookVersion,
  SalesPriceBookVersionDiff,
} from '../types'

export type PublishVersionCandidate = {
  book: SalesPriceBook
  version: SalesPriceBookVersion
  items: SalesPriceBookItem[]
  diff?: SalesPriceBookVersionDiff
}

type PublishVersionDialogProps = {
  candidate?: PublishVersionCandidate
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (versionId: number) => void
}

function percent(value: string | undefined) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return `${(parsed * 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

export function PublishVersionDialog(props: PublishVersionDialogProps) {
  const { t } = useTranslation()
  const candidate = props.candidate
  const enabledCount =
    candidate?.items.filter((item) => item.status === 'enabled').length ?? 0
  const disabledCount =
    candidate?.items.filter((item) => item.status === 'disabled').length ?? 0
  const diff = candidate?.diff
  const changedItems = diff?.items.filter(
    (item) => item.change_type === 'added' || item.change_type === 'changed'
  )
  const priceChanges = (changedItems ?? [])
    .map((item) => Number(item.price_change_rate))
    .filter(Number.isFinite)
  const margins = (diff?.items ?? [])
    .filter((item) => item.new_item?.status === 'enabled')
    .map((item) => Number(item.margin_after))
    .filter(Number.isFinite)
  const maximumIncrease = priceChanges.length
    ? Math.max(...priceChanges, 0).toString()
    : undefined
  const maximumDecrease = priceChanges.length
    ? Math.min(...priceChanges, 0).toString()
    : undefined
  const minimumMargin = margins.length
    ? Math.min(...margins).toString()
    : undefined
  const hasCoverageWarning = (diff?.removed_count ?? 0) > 0 || disabledCount > 0

  return (
    <AlertDialog open={Boolean(candidate)} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Confirm price book publication')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Publishing immediately changes customer billing. Review the impact before continuing.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {candidate ? (
          <div className='flex flex-col gap-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-sm'>
                  {t('Price book')}
                </p>
                <p className='font-semibold'>{candidate.book.name}</p>
                <p className='text-muted-foreground text-sm'>
                  {candidate.book.audience.toUpperCase()}
                </p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-sm'>
                  {t('Version change')}
                </p>
                <p className='font-semibold'>
                  {candidate.book.current_version
                    ? `v${candidate.book.current_version.version} → v${candidate.version.version}`
                    : `${t('No active version')} → v${candidate.version.version}`}
                </p>
                <p className='text-muted-foreground text-sm'>
                  {t('{{count}} assigned users affected', {
                    count: candidate.book.assigned_users,
                  })}
                </p>
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Badge>
                {t('{{count}} enabled models', { count: enabledCount })}
              </Badge>
              <Badge variant='outline'>
                {t('{{count}} added', {
                  count: diff?.added_count ?? enabledCount,
                })}
              </Badge>
              <Badge variant='outline'>
                {t('{{count}} changed', { count: diff?.changed_count ?? 0 })}
              </Badge>
              <Badge
                variant={
                  (diff?.removed_count ?? 0) > 0 ? 'destructive' : 'outline'
                }
              >
                {t('{{count}} removed', { count: diff?.removed_count ?? 0 })}
              </Badge>
              <Badge variant={disabledCount > 0 ? 'warning' : 'outline'}>
                {t('{{count}} disabled', { count: disabledCount })}
              </Badge>
            </div>
            <div className='grid gap-3 sm:grid-cols-3'>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-sm'>
                  {t('Maximum increase')}
                </p>
                <p className='font-semibold'>{percent(maximumIncrease)}</p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-sm'>
                  {t('Maximum decrease')}
                </p>
                <p className='font-semibold'>{percent(maximumDecrease)}</p>
              </div>
              <div className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-sm'>
                  {t('Lowest margin')}
                </p>
                <p className='font-semibold'>{percent(minimumMargin)}</p>
              </div>
            </div>
            {hasCoverageWarning ? (
              <Alert variant='destructive'>
                <AlertTitle>{t('Model coverage will decrease')}</AlertTitle>
                <AlertDescription>
                  {t(
                    'Removed or disabled model prices will no longer be available to customers after publication.'
                  )}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={props.pending || !candidate}
            onClick={(event) => {
              event.preventDefault()
              if (candidate) props.onConfirm(candidate.version.id)
            }}
          >
            {props.pending ? <Spinner data-icon='inline-start' /> : null}
            {t('Publish and apply to customers')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
