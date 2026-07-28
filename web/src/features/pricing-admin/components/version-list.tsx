import { useState } from 'react'
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

import { ConfirmDialog } from '@/components/confirm-dialog'
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
  isDeleting: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
  onDelete: (id: number) => void
  onEdit?: (id: number) => void
  onFill?: (id: number) => void
}

export function VersionList(props: VersionListProps) {
  const { t } = useTranslation()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  if (props.items.length === 0) {
    return (
      <p className='text-muted-foreground rounded-lg border border-dashed p-4 text-center'>
        {t('No price versions yet')}
      </p>
    )
  }

  return (
    <div className='space-y-2'>
      {props.items.map((item) => {
        let statusLabel = item.status
        if (item.status === 'active') {
          statusLabel = t('active')
        } else if (item.status === 'draft') {
          statusLabel = t('draft')
        } else if (item.status === 'suspended') {
          statusLabel = t('suspended')
        } else if (item.status === 'expired') {
          statusLabel = t('expired')
        }
        return (
          <div
            key={item.id}
            className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
          >
            <div className='min-w-0 space-y-1'>
              <div className='flex items-center gap-2'>
                <span className='font-medium'>
                  {t('Version')} {item.version}
                </span>
                <Badge
                  variant={item.status === 'active' ? 'default' : 'outline'}
                >
                  {statusLabel}
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
            <div className='flex flex-wrap justify-end gap-2'>
              {props.onFill ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => props.onFill?.(item.id)}
                >
                  {t('Duplicate')}
                </Button>
              ) : null}
              {item.status === 'draft' && props.onEdit ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => props.onEdit?.(item.id)}
                >
                  {t('Edit')}
                </Button>
              ) : null}
              {item.status === 'draft' ? (
                <>
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={props.isDeleting}
                    onClick={() => setDeleteId(item.id)}
                  >
                    {t('Delete')}
                  </Button>
                  <Button
                    size='sm'
                    disabled={props.isPublishing}
                    onClick={() => props.onPublish(item.id)}
                  >
                    {t('Publish')}
                  </Button>
                </>
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
          </div>
        )
      })}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteId(null)
          }
        }}
        title={t('Delete price draft?')}
        desc={t(
          'This draft will be permanently deleted. Published price history is never deleted.'
        )}
        confirmText={t('Delete Draft')}
        destructive
        isLoading={props.isDeleting}
        handleConfirm={() => {
          if (deleteId !== null) {
            props.onDelete(deleteId)
          }
          setDeleteId(null)
        }}
      />
    </div>
  )
}
