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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { searchUsers } from '@/features/users/api'
import { handleServerError } from '@/lib/handle-server-error'

import { assignUserPriceBook, getSalesPriceBookVersions } from '../api'
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
  const [userKeyword, setUserKeyword] = useState('')
  const [priceBookId, setPriceBookId] = useState('')
  const [versionPolicy, setVersionPolicy] = useState<
    'follow_current' | 'pin_version'
  >('follow_current')
  const [pinnedVersionId, setPinnedVersionId] = useState('')
  const [quoteReference, setQuoteReference] = useState('')
  const [contractReference, setContractReference] = useState('')
  const [remark, setRemark] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [expirationMode, setExpirationMode] = useState<'never' | 'custom'>(
    'never'
  )
  const [effectiveTo, setEffectiveTo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deferredUserKeyword = useDeferredValue(userKeyword)
  const selectedBookId = Number(priceBookId)
  const expirationEndMissing = expirationMode === 'custom' && !effectiveTo
  const assignmentWindowInvalid =
    expirationMode === 'custom' &&
    Boolean(effectiveTo) &&
    new Date(effectiveTo).getTime() <=
      (effectiveFrom ? new Date(effectiveFrom).getTime() : Date.now())
  let expirationError = ''
  if (expirationEndMissing) {
    expirationError = t('End time is required')
  } else if (assignmentWindowInvalid) {
    expirationError = t('Effective end must be after start')
  }
  const usersQuery = useQuery({
    queryKey: ['sales-price-books', 'assignment-users', deferredUserKeyword],
    queryFn: () =>
      searchUsers({
        keyword: deferredUserKeyword.trim(),
        p: 1,
        page_size: 50,
      }),
    enabled: props.open,
  })
  const users = usersQuery.data?.data?.items ?? []
  const selectedUser = users.find((user) => String(user.id) === userId)
  const selectedBook = props.books.find((book) => book.id === selectedBookId)
  useEffect(() => {
    if (props.open) return
    setUserId('')
    setUserKeyword('')
    setPriceBookId('')
    setVersionPolicy('follow_current')
    setPinnedVersionId('')
    setQuoteReference('')
    setContractReference('')
    setRemark('')
    setEffectiveFrom('')
    setExpirationMode('never')
    setEffectiveTo('')
    setConfirmOpen(false)
  }, [props.open])
  const versionsQuery = useQuery({
    queryKey: ['sales-price-books', 'versions', selectedBookId, 'assignment'],
    queryFn: () => getSalesPriceBookVersions(selectedBookId),
    enabled:
      props.open && versionPolicy === 'pin_version' && selectedBookId > 0,
  })
  const availableVersions = (versionsQuery.data?.data ?? []).filter(
    (version) => version.status === 'active' || version.status === 'superseded'
  )
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
        effective_from: effectiveFrom
          ? Math.floor(new Date(effectiveFrom).getTime() / 1000)
          : undefined,
        effective_to:
          expirationMode === 'custom' && effectiveTo
            ? Math.floor(new Date(effectiveTo).getTime() / 1000)
            : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'assignments'],
      })
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'list'],
      })
      toast.success(t('User assigned to price book'))
      setConfirmOpen(false)
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (expirationEndMissing) {
      toast.error(t('End time is required'))
      return
    }
    if (assignmentWindowInvalid) {
      toast.error(t('Effective end must be after start'))
      return
    }
    setConfirmOpen(true)
  }

  return (
    <>
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
                <FieldLabel htmlFor='assignment-user-search'>
                  {t('Search and select user')}
                </FieldLabel>
                <Input
                  id='assignment-user-search'
                  value={userKeyword}
                  placeholder={t('Search username, email, or user ID')}
                  onChange={(event) => {
                    setUserKeyword(event.target.value)
                    setUserId('')
                  }}
                />
                <Select
                  value={userId}
                  onValueChange={(value) => value && setUserId(value)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue
                      placeholder={t('Select a user from search results')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={String(user.id)}>
                          {user.username} · #{user.id}
                          {user.email ? ` · ${user.email}` : ''}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                    onValueChange={(value) =>
                      value && setPinnedVersionId(value)
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue
                        placeholder={t('Select published version')}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {availableVersions.map((version) => (
                          <SelectItem
                            key={version.id}
                            value={String(version.id)}
                          >
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
                    onChange={(event) =>
                      setContractReference(event.target.value)
                    }
                  />
                </Field>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <Field>
                  <FieldLabel htmlFor='assignment-effective-from'>
                    {t('Effective from')}
                  </FieldLabel>
                  <Input
                    id='assignment-effective-from'
                    type='datetime-local'
                    value={effectiveFrom}
                    max={effectiveTo || undefined}
                    onChange={(event) => setEffectiveFrom(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel id='assignment-expiration-mode'>
                    {t('Effective to')}
                  </FieldLabel>
                  <ToggleGroup
                    aria-labelledby='assignment-expiration-mode'
                    className='grid w-full grid-cols-2'
                    spacing={2}
                    variant='outline'
                    value={[expirationMode]}
                    onValueChange={(value) => {
                      const nextMode = value.find(
                        (item) => item !== expirationMode
                      )
                      if (nextMode !== 'never' && nextMode !== 'custom') return
                      setExpirationMode(nextMode)
                      if (nextMode === 'never') setEffectiveTo('')
                    }}
                  >
                    <ToggleGroupItem value='never' className='w-full'>
                      {t('Long-term (default)')}
                    </ToggleGroupItem>
                    <ToggleGroupItem value='custom' className='w-full'>
                      {t('Set end time')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </Field>
              </div>
              {expirationMode === 'custom' ? (
                <Field
                  data-invalid={
                    expirationEndMissing || assignmentWindowInvalid || undefined
                  }
                >
                  <FieldLabel htmlFor='assignment-effective-to'>
                    {t('Effective to')}
                  </FieldLabel>
                  <Input
                    id='assignment-effective-to'
                    type='datetime-local'
                    value={effectiveTo}
                    min={effectiveFrom || undefined}
                    aria-invalid={
                      expirationEndMissing ||
                      assignmentWindowInvalid ||
                      undefined
                    }
                    onChange={(event) => setEffectiveTo(event.target.value)}
                  />
                  {expirationError ? (
                    <FieldDescription>{expirationError}</FieldDescription>
                  ) : null}
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor='assignment-remark'>
                  {t('Remark')}
                </FieldLabel>
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
                  expirationEndMissing ||
                  assignmentWindowInvalid ||
                  (versionPolicy === 'pin_version' && !Number(pinnedVersionId))
                }
              >
                {mutation.isPending ? (
                  <Spinner data-icon='inline-start' />
                ) : null}
                {t('Assign')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Confirm user price book assignment')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "This replaces the user's current active or scheduled price book assignment."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='grid gap-2 rounded-lg border p-3 text-sm'>
            <p>
              <span className='text-muted-foreground'>{t('User')}: </span>
              {selectedUser?.username ?? `#${userId}`}
            </p>
            <p>
              <span className='text-muted-foreground'>
                {t('Sales price book')}:{' '}
              </span>
              {selectedBook?.name ?? '—'}
            </p>
            <p>
              <span className='text-muted-foreground'>
                {t('Effective from')}:{' '}
              </span>
              {effectiveFrom || t('Immediately')}
            </p>
            <p>
              <span className='text-muted-foreground'>
                {t('Effective to')}:{' '}
              </span>
              {expirationMode === 'custom' && effectiveTo
                ? effectiveTo
                : t('Long-term (default)')}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                mutation.mutate()
              }}
            >
              {mutation.isPending ? <Spinner data-icon='inline-start' /> : null}
              {t('Confirm assignment')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
