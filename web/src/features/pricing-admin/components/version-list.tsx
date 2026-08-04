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
  dependency_label?: string
  publish_dependency_notice?: string
}

type VersionListProps = {
  items: VersionListItem[]
  isPublishing: boolean
  isSuspending: boolean
  isDeleting: boolean
  onPublish: (id: number) => void
  onSuspend: (id: number) => void
  onDelete: (id: number) => void
  onView?: (id: number) => void
  onEdit?: (id: number) => void
  onFill?: (id: number) => void
  allowSuspend?: boolean
  showId?: boolean
  canWrite?: boolean
  canPublish?: boolean
}

export function VersionList(props: VersionListProps) {
  const { t } = useTranslation()
  const canWrite = props.canWrite !== false
  const canPublish = props.canPublish !== false
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [pendingAction, setPendingAction] = useState<{
    item: VersionListItem
    kind: 'publish' | 'suspend'
  } | null>(null)
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
                {props.showId ? (
                  <span className='text-muted-foreground font-mono text-xs'>
                    ID #{item.id}
                  </span>
                ) : null}
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
              {props.onView ? (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => props.onView?.(item.id)}
                >
                  {t('View')}
                </Button>
              ) : null}
              {canWrite && props.onFill ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => props.onFill?.(item.id)}
                >
                  {t('Duplicate')}
                </Button>
              ) : null}
              {canWrite && item.status === 'draft' && props.onEdit ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => props.onEdit?.(item.id)}
                >
                  {t('Edit')}
                </Button>
              ) : null}
              {item.status === 'draft' && (canWrite || canPublish) ? (
                <>
                  {canWrite ? (
                    <Button
                      size='sm'
                      variant='ghost'
                      disabled={props.isDeleting}
                      onClick={() => setDeleteId(item.id)}
                    >
                      {t('Delete')}
                    </Button>
                  ) : null}
                  {canPublish ? (
                    <Button
                      size='sm'
                      disabled={props.isPublishing}
                      onClick={() =>
                        setPendingAction({ item, kind: 'publish' })
                      }
                    >
                      {t('Publish')}
                    </Button>
                  ) : null}
                </>
              ) : null}
              {canPublish &&
              item.status === 'active' &&
              props.allowSuspend !== false ? (
                <Button
                  size='sm'
                  variant='destructive'
                  disabled={props.isSuspending}
                  onClick={() => setPendingAction({ item, kind: 'suspend' })}
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
      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null)
          }
        }}
        title={
          pendingAction?.kind === 'suspend'
            ? t('Suspend price version?')
            : t('Publish price version?')
        }
        desc={
          <div className='space-y-2'>
            <p>
              {pendingAction?.kind === 'suspend'
                ? t(
                    'This active price will stop being available. Dependent version checks still apply.'
                  )
                : t(
                    'This draft will become active and replace the current active version for this scope.'
                  )}
            </p>
            {pendingAction ? (
              <p className='text-foreground font-medium'>
                {t('Version')} {pendingAction.item.version}
                {pendingAction.item.dependency_label
                  ? ` · ${pendingAction.item.dependency_label}`
                  : ''}
              </p>
            ) : null}
            {pendingAction?.kind === 'publish' &&
            pendingAction.item.publish_dependency_notice ? (
              <p className='border-primary/30 bg-primary/5 rounded-md border p-2 text-sm'>
                {pendingAction.item.publish_dependency_notice}
              </p>
            ) : null}
          </div>
        }
        confirmText={
          pendingAction?.kind === 'suspend'
            ? t('Confirm Suspend')
            : t('Confirm Publish')
        }
        destructive={pendingAction?.kind === 'suspend'}
        isLoading={
          pendingAction?.kind === 'suspend'
            ? props.isSuspending
            : props.isPublishing
        }
        handleConfirm={() => {
          if (pendingAction?.kind === 'suspend') {
            props.onSuspend(pendingAction.item.id)
          } else if (pendingAction) {
            props.onPublish(pendingAction.item.id)
          }
          setPendingAction(null)
        }}
      />
    </div>
  )
}
