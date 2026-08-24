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

import { assignUserPriceBook } from '../api'
import type { SalesPriceBook } from '../types'

type AssignUserDialogProps = {
  open: boolean
  books: SalesPriceBook[]
  onOpenChange: (open: boolean) => void
}

export function AssignUserDialog(props: AssignUserDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [userId, setUserId] = useState('')
  const [priceBookId, setPriceBookId] = useState('')
  const [versionPolicy, setVersionPolicy] = useState<
    'follow_current' | 'pin_version'
  >('follow_current')
  const [pinnedVersionId, setPinnedVersionId] = useState('')
  const [quoteReference, setQuoteReference] = useState('')
  const [contractReference, setContractReference] = useState('')
  const [remark, setRemark] = useState('')
  const selectedBookId = Number(priceBookId)
  const availableVersions = props.books
    .filter((book) => book.id === selectedBookId)
    .flatMap((book) => (book.current_version ? [book.current_version] : []))
  const mutation = useMutation({
    mutationFn: () =>
      assignUserPriceBook({
        user_id: Number(userId),
        price_book_id: selectedBookId,
        version_policy: versionPolicy,
        pinned_version_id:
          versionPolicy === 'pin_version' ? Number(pinnedVersionId) : undefined,
        quote_reference: quoteReference.trim() || undefined,
        contract_reference: contractReference.trim() || undefined,
        remark: remark.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'assignments'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'list'],
      })
      toast.success(t('User assigned to price book'))
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Assign user price book')}</DialogTitle>
            <DialogDescription>
              {t(
                "The active assignment replaces the user's previous pricing assignment."
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <Field>
              <FieldLabel htmlFor='assignment-user-id'>
                {t('User ID')}
              </FieldLabel>
              <Input
                id='assignment-user-id'
                type='number'
                min='1'
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>{t('Sales price book')}</FieldLabel>
              <Select
                value={priceBookId}
                onValueChange={(value) => {
                  if (!value) return
                  setPriceBookId(value)
                  setPinnedVersionId('')
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder={t('Select price book')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {props.books
                      .filter((book) => book.status === 'enabled')
                      .map((book) => (
                        <SelectItem key={book.id} value={String(book.id)}>
                          {book.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t('Version policy')}</FieldLabel>
              <Select
                value={versionPolicy}
                onValueChange={(value) =>
                  value &&
                  setVersionPolicy(value as 'follow_current' | 'pin_version')
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='follow_current'>
                      {t('Follow current version')}
                    </SelectItem>
                    <SelectItem value='pin_version'>
                      {t('Pin contract version')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {versionPolicy === 'pin_version' ? (
              <Field>
                <FieldLabel>{t('Pinned version')}</FieldLabel>
                <Select
                  value={pinnedVersionId}
                  onValueChange={(value) => value && setPinnedVersionId(value)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder={t('Select active version')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableVersions.map((version) => (
                        <SelectItem key={version.id} value={String(version.id)}>
                          v{version.version}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field>
                <FieldLabel htmlFor='quote-reference'>
                  {t('Quote reference')}
                </FieldLabel>
                <Input
                  id='quote-reference'
                  value={quoteReference}
                  onChange={(event) => setQuoteReference(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor='contract-reference'>
                  {t('Contract reference')}
                </FieldLabel>
                <Input
                  id='contract-reference'
                  value={contractReference}
                  onChange={(event) => setContractReference(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor='assignment-remark'>{t('Remark')}</FieldLabel>
              <Textarea
                id='assignment-remark'
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
              disabled={
                mutation.isPending ||
                !Number(userId) ||
                !selectedBookId ||
                (versionPolicy === 'pin_version' && !Number(pinnedVersionId))
              }
            >
              {mutation.isPending ? <Spinner data-icon='inline-start' /> : null}
              {t('Assign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
