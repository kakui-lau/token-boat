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
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

type ReviewItemDialogProps = {
  itemId?: number
  action: 'accept' | 'reject'
  reason: string
  detail: string
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (itemId: number, comment: string) => void
}

export function ReviewItemDialog(props: ReviewItemDialogProps) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!props.itemId || !comment.trim()) return
    props.onSubmit(props.itemId, comment.trim())
  }

  return (
    <Dialog
      open={Boolean(props.itemId)}
      onOpenChange={(open) => {
        if (!open) setComment('')
        props.onOpenChange(open)
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {props.action === 'accept'
                ? t('Accept pricing risk')
                : t('Reject pricing risk')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'Record the review decision so the change batch can be closed.'
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <div className='bg-destructive/5 border-destructive/20 rounded-lg border p-4'>
              <p className='text-sm font-medium'>{t('Review reason')}</p>
              <p className='text-destructive mt-1 text-sm'>
                {props.reason || t('Requires review')}
              </p>
              {props.detail ? (
                <p className='text-muted-foreground mt-2 text-xs'>
                  {props.detail}
                </p>
              ) : null}
            </div>
            <Field>
              <FieldLabel htmlFor='pricing-review-comment'>
                {t('Review comment')}
              </FieldLabel>
              <Textarea
                id='pricing-review-comment'
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              variant={props.action === 'reject' ? 'destructive' : 'default'}
              disabled={props.pending || !comment.trim()}
            >
              {props.pending ? <Spinner data-icon='inline-start' /> : null}
              {props.action === 'accept' ? t('Accept risk') : t('Reject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
