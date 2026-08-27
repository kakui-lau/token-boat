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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import { createSalesPriceBook } from '../api'
import type { SalesPriceBook, SalesPriceBookAudience } from '../types'

type CreateBookDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (book: SalesPriceBook) => void
}

export function CreateBookDialog(props: CreateBookDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [audience, setAudience] = useState<SalesPriceBookAudience>('tob')
  const [remark, setRemark] = useState('')
  const mutation = useMutation({
    mutationFn: () =>
      createSalesPriceBook({
        code: code.trim(),
        name: name.trim(),
        audience,
        currency: 'USD',
        remark: remark.trim(),
      }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'list'],
      })
      toast.success(t('Sales price book created'))
      setCode('')
      setName('')
      setRemark('')
      props.onOpenChange(false)
      props.onCreated(response.data)
    },
    onError: handleServerError,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!code.trim() || !name.trim()) return
    mutation.mutate()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Create sales price book')}</DialogTitle>
            <DialogDescription>
              {t('Create a reusable TOC or TOB customer pricing policy.')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <Field>
              <FieldLabel htmlFor='price-book-code'>
                {t('Price book code')}
              </FieldLabel>
              <Input
                id='price-book-code'
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder='tob-standard-2026'
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='price-book-name'>
                {t('Price book name')}
              </FieldLabel>
              <Input
                id='price-book-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t('Audience')}</FieldLabel>
              <Select
                value={audience}
                onValueChange={(value) =>
                  value && setAudience(value as SalesPriceBookAudience)
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='toc'>{t('TOC')}</SelectItem>
                    <SelectItem value='tob'>{t('TOB')}</SelectItem>
                    <SelectItem value='internal'>{t('Internal')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor='price-book-remark'>{t('Remark')}</FieldLabel>
              <Textarea
                id='price-book-remark'
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
            <Button
              type='submit'
              disabled={!code.trim() || !name.trim() || mutation.isPending}
            >
              {mutation.isPending ? <Spinner data-icon='inline-start' /> : null}
              {t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
