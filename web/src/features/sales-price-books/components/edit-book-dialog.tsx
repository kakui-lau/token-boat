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
import { useEffect, useState, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import type { SalesPriceBook } from '../types'

type EditBookDialogProps = {
  book?: SalesPriceBook
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (name: string, remark: string) => void
}

export function EditBookDialog(props: EditBookDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [remark, setRemark] = useState('')

  useEffect(() => {
    setName(props.book?.name ?? '')
    setRemark(props.book?.remark ?? '')
  }, [props.book?.id, props.book?.name, props.book?.remark])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    props.onSubmit(name.trim(), remark.trim())
  }

  return (
    <Dialog open={Boolean(props.book)} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Edit sales price book')}</DialogTitle>
            <DialogDescription>
              {t(
                'The stable code and audience cannot be changed after creation.'
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <Field>
              <FieldLabel htmlFor='edit-price-book-name'>
                {t('Name')}
              </FieldLabel>
              <Input
                id='edit-price-book-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='edit-price-book-remark'>
                {t('Remark')}
              </FieldLabel>
              <Textarea
                id='edit-price-book-remark'
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
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
            <Button type='submit' disabled={props.pending || !name.trim()}>
              {props.pending ? <Spinner data-icon='inline-start' /> : null}
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
