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
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'

import {
  cancelUserPriceBookAssignment,
  cloneSalesPriceBookVersion,
  disableSalesPriceBook,
  getSalesPriceBookItems,
  getSalesPriceBooks,
  getSalesPriceBookVersions,
  getUserPriceBookAssignments,
  publishSalesPriceBookVersion,
  setDefaultSalesPriceBook,
} from './api'
import { AssignUserDialog } from './components/assign-user-dialog'
import { CreateBookDialog } from './components/create-book-dialog'
import { CreateVersionDialog } from './components/create-version-dialog'
import { GenerateItemsDialog } from './components/generate-items-dialog'
import type { SalesPriceBookStatus, SalesPriceBookVersionStatus } from './types'

function bookStatusLabel(
  status: SalesPriceBookStatus,
  t: (key: string) => string
) {
  switch (status) {
    case 'draft':
      return t('Draft')
    case 'enabled':
      return t('Enabled')
    case 'disabled':
      return t('Disabled')
    case 'archived':
      return t('Archived')
  }
}

function versionStatusLabel(
  status: SalesPriceBookVersionStatus,
  t: (key: string) => string
) {
  switch (status) {
    case 'draft':
      return t('Draft')
    case 'active':
      return t('Active')
    case 'scheduled':
      return t('Scheduled')
    case 'superseded':
      return t('Superseded')
    case 'cancelled':
      return t('Cancelled')
  }
}

function percent(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? `${number * 100}%` : '—'
}

export function SalesPriceBooks() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [selectedBookId, setSelectedBookId] = useState<number>()
  const [selectedVersionId, setSelectedVersionId] = useState<number>()
  const [createBookOpen, setCreateBookOpen] = useState(false)
  const [createVersionOpen, setCreateVersionOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const deferredKeyword = useDeferredValue(keyword)

  const booksQuery = useQuery({
    queryKey: ['sales-price-books', 'list'],
    queryFn: getSalesPriceBooks,
  })
  const books = booksQuery.data?.data ?? []
  const filteredBooks = books.filter((book) => {
    const search = deferredKeyword.trim().toLowerCase()
    return (
      !search ||
      book.name.toLowerCase().includes(search) ||
      book.code.toLowerCase().includes(search)
    )
  })
  const selectedBook =
    books.find((book) => book.id === selectedBookId) ?? books[0]
  const selectedBookQueryId = selectedBook?.id ?? 0
  const versionsQuery = useQuery({
    queryKey: ['sales-price-books', 'versions', selectedBookQueryId],
    queryFn: () => getSalesPriceBookVersions(selectedBookQueryId),
    enabled: Boolean(selectedBook),
  })
  const versions = versionsQuery.data?.data ?? []
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0]
  const selectedVersionQueryId = selectedVersion?.id ?? 0
  const itemsQuery = useQuery({
    queryKey: ['sales-price-books', 'items', selectedVersionQueryId],
    queryFn: () => getSalesPriceBookItems(selectedVersionQueryId),
    enabled: Boolean(selectedVersion),
  })
  const assignmentsQuery = useQuery({
    queryKey: ['sales-price-books', 'assignments'],
    queryFn: () => getUserPriceBookAssignments(),
  })

  const refreshBooks = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['sales-price-books', 'list'],
    })
  }
  const publishMutation = useMutation({
    mutationFn: publishSalesPriceBookVersion,
    onSuccess: async () => {
      await refreshBooks()
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions'],
      })
      toast.success(t('Price book version published'))
    },
    onError: handleServerError,
  })
  const cloneMutation = useMutation({
    mutationFn: ({
      bookId,
      versionId,
    }: {
      bookId: number
      versionId: number
    }) => cloneSalesPriceBookVersion(bookId, versionId),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions', selectedBook?.id],
      })
      setSelectedVersionId(response.data.id)
      toast.success(t('Draft version copied'))
    },
    onError: handleServerError,
  })
  const defaultMutation = useMutation({
    mutationFn: setDefaultSalesPriceBook,
    onSuccess: () => toast.success(t('TOC default price book updated')),
    onError: handleServerError,
  })
  const disableMutation = useMutation({
    mutationFn: disableSalesPriceBook,
    onSuccess: async () => {
      await refreshBooks()
      toast.success(t('Sales price book disabled'))
    },
    onError: handleServerError,
  })
  const cancelAssignmentMutation = useMutation({
    mutationFn: cancelUserPriceBookAssignment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'assignments'],
      })
      await refreshBooks()
      toast.success(t('Price book assignment cancelled'))
    },
    onError: handleServerError,
  })

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Sales Price Books')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button onClick={() => setCreateBookOpen(true)}>
          {t('Create price book')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex min-w-0 flex-col gap-4'>
          <Alert>
            <AlertTitle>
              {t('Purchase costs and customer prices are separated')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'A customer receives one logical-model price from the assigned price book, while routing evaluates each upstream purchase cost independently.'
              )}
            </AlertDescription>
          </Alert>
          <Tabs defaultValue='books'>
            <TabsList>
              <TabsTrigger value='books'>{t('Price books')}</TabsTrigger>
              <TabsTrigger value='assignments'>
                {t('User assignments')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value='books' className='mt-4 flex flex-col gap-4'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('Price books')}</CardTitle>
                  <CardDescription>
                    {t(
                      'Select a price book to manage versions and model prices.'
                    )}
                  </CardDescription>
                  <CardAction>
                    <Input
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder={t('Search name or code')}
                      aria-label={t('Search name or code')}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {booksQuery.isLoading ? (
                    <Skeleton className='h-40 w-full' />
                  ) : null}
                  {!booksQuery.isLoading && filteredBooks.length === 0 ? (
                    <Empty className='min-h-40'>
                      <EmptyHeader>
                        <EmptyTitle>{t('No sales price books')}</EmptyTitle>
                        <EmptyDescription>
                          {t(
                            'Create the first TOC or TOB price book to continue.'
                          )}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : null}
                  {filteredBooks.length > 0 ? (
                    <Table className='min-w-[58rem]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('Name')}</TableHead>
                          <TableHead>{t('Code')}</TableHead>
                          <TableHead>{t('Audience')}</TableHead>
                          <TableHead>{t('Status')}</TableHead>
                          <TableHead>{t('Current version')}</TableHead>
                          <TableHead>{t('Models')}</TableHead>
                          <TableHead>{t('Assigned users')}</TableHead>
                          <TableHead>{t('Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBooks.map((book) => (
                          <TableRow
                            key={book.id}
                            data-state={
                              selectedBook?.id === book.id
                                ? 'selected'
                                : undefined
                            }
                          >
                            <TableCell>
                              <Button
                                variant='link'
                                className='h-auto p-0 font-medium'
                                onClick={() => {
                                  setSelectedBookId(book.id)
                                  setSelectedVersionId(undefined)
                                }}
                              >
                                {book.name}
                              </Button>
                            </TableCell>
                            <TableCell>{book.code}</TableCell>
                            <TableCell>{book.audience.toUpperCase()}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  book.status === 'enabled'
                                    ? 'default'
                                    : 'outline'
                                }
                              >
                                {bookStatusLabel(book.status, t)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {book.current_version
                                ? `v${book.current_version.version}`
                                : '—'}
                            </TableCell>
                            <TableCell>{book.model_count}</TableCell>
                            <TableCell>{book.assigned_users}</TableCell>
                            <TableCell>
                              <div className='flex gap-2'>
                                {book.audience === 'toc' &&
                                book.status === 'enabled' ? (
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    disabled={defaultMutation.isPending}
                                    onClick={() =>
                                      defaultMutation.mutate(book.id)
                                    }
                                  >
                                    {t('Set TOC default')}
                                  </Button>
                                ) : null}
                                {book.status !== 'disabled' &&
                                book.status !== 'archived' ? (
                                  <Button
                                    size='sm'
                                    variant='outline'
                                    disabled={disableMutation.isPending}
                                    onClick={() =>
                                      disableMutation.mutate(book.id)
                                    }
                                  >
                                    {t('Disable')}
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                </CardContent>
              </Card>

              {selectedBook ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('Versions for {{name}}', { name: selectedBook.name })}
                    </CardTitle>
                    <CardDescription>
                      {t(
                        'Published versions are immutable and remain available for audit.'
                      )}
                    </CardDescription>
                    <CardAction>
                      <Button
                        size='sm'
                        onClick={() => setCreateVersionOpen(true)}
                      >
                        {t('Create draft version')}
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    {versionsQuery.isLoading ? (
                      <Skeleton className='h-32 w-full' />
                    ) : null}
                    {versions.length > 0 ? (
                      <Table className='min-w-[66rem]'>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Version')}</TableHead>
                            <TableHead>{t('Status')}</TableHead>
                            <TableHead>{t('Cost basis')}</TableHead>
                            <TableHead>{t('Variable cost rate')}</TableHead>
                            <TableHead>{t('Tax rate')}</TableHead>
                            <TableHead>{t('Target margin')}</TableHead>
                            <TableHead>{t('Actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {versions.map((version) => (
                            <TableRow
                              key={version.id}
                              data-state={
                                selectedVersion?.id === version.id
                                  ? 'selected'
                                  : undefined
                              }
                            >
                              <TableCell>
                                <Button
                                  variant='link'
                                  className='h-auto p-0'
                                  onClick={() =>
                                    setSelectedVersionId(version.id)
                                  }
                                >
                                  v{version.version}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    version.status === 'active'
                                      ? 'default'
                                      : 'outline'
                                  }
                                >
                                  {versionStatusLabel(version.status, t)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {version.cost_basis_strategy}
                              </TableCell>
                              <TableCell>
                                {percent(version.total_variable_cost_rate)}
                              </TableCell>
                              <TableCell>
                                {percent(version.effective_tax_rate)}
                              </TableCell>
                              <TableCell>
                                {percent(version.target_net_margin)}
                              </TableCell>
                              <TableCell>
                                <div className='flex gap-2'>
                                  {version.status === 'draft' ? (
                                    <>
                                      <Button
                                        size='sm'
                                        variant='outline'
                                        onClick={() => {
                                          setSelectedVersionId(version.id)
                                          setGenerateOpen(true)
                                        }}
                                      >
                                        {t('Generate prices')}
                                      </Button>
                                      <Button
                                        size='sm'
                                        disabled={publishMutation.isPending}
                                        onClick={() =>
                                          publishMutation.mutate(version.id)
                                        }
                                      >
                                        {t('Publish')}
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      disabled={cloneMutation.isPending}
                                      onClick={() =>
                                        cloneMutation.mutate({
                                          bookId: selectedBook.id,
                                          versionId: version.id,
                                        })
                                      }
                                    >
                                      {t('Copy as draft')}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {selectedVersion ? (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {t('Model prices in version {{version}}', {
                        version: selectedVersion.version,
                      })}
                    </CardTitle>
                    <CardDescription>
                      {t(
                        'One logical model has one customer price in each version.'
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {itemsQuery.isLoading ? (
                      <Skeleton className='h-32 w-full' />
                    ) : null}
                    {(itemsQuery.data?.data.length ?? 0) > 0 ? (
                      <Table className='min-w-[72rem]'>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('Model Name')}</TableHead>
                            <TableHead>{t('Status')}</TableHead>
                            <TableHead>{t('Billing mode')}</TableHead>
                            <TableHead>{t('Pricing method')}</TableHead>
                            <TableHead>{t('Selling factor')}</TableHead>
                            <TableHead>{t('Sales expression')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {itemsQuery.data?.data.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className='font-medium'>
                                {item.model_name}
                              </TableCell>
                              <TableCell>{item.status}</TableCell>
                              <TableCell>{item.billing_mode}</TableCell>
                              <TableCell>{item.pricing_method}</TableCell>
                              <TableCell>
                                {item.selling_factor || '—'}
                              </TableCell>
                              <TableCell className='max-w-[36rem] truncate font-mono text-xs'>
                                {item.sales_billing_expr}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Empty className='min-h-32'>
                        <EmptyHeader>
                          <EmptyTitle>
                            {t('No model prices in this version')}
                          </EmptyTitle>
                          <EmptyDescription>
                            {t(
                              'Generate prices from selected channel models before publishing.'
                            )}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value='assignments' className='mt-4'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('User assignments')}</CardTitle>
                  <CardDescription>
                    {t('Bind TOB users directly to a reusable price book.')}
                  </CardDescription>
                  <CardAction>
                    <Button onClick={() => setAssignOpen(true)}>
                      {t('Assign user')}
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  {assignmentsQuery.isLoading ? (
                    <Skeleton className='h-40 w-full' />
                  ) : null}
                  {(assignmentsQuery.data?.data.length ?? 0) > 0 ? (
                    <Table className='min-w-[70rem]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('User ID')}</TableHead>
                          <TableHead>{t('Sales price book')}</TableHead>
                          <TableHead>{t('Version policy')}</TableHead>
                          <TableHead>{t('Status')}</TableHead>
                          <TableHead>{t('Quote reference')}</TableHead>
                          <TableHead>{t('Contract reference')}</TableHead>
                          <TableHead>{t('Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignmentsQuery.data?.data.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell>{assignment.user_id}</TableCell>
                            <TableCell>
                              {books.find(
                                (book) => book.id === assignment.price_book_id
                              )?.name ?? assignment.price_book_id}
                            </TableCell>
                            <TableCell>
                              {assignment.version_policy === 'follow_current'
                                ? t('Follow current version')
                                : t('Pin contract version')}
                            </TableCell>
                            <TableCell>{assignment.status}</TableCell>
                            <TableCell>
                              {assignment.quote_reference || '—'}
                            </TableCell>
                            <TableCell>
                              {assignment.contract_reference || '—'}
                            </TableCell>
                            <TableCell>
                              {assignment.status === 'active' ||
                              assignment.status === 'scheduled' ? (
                                <Button
                                  size='sm'
                                  variant='outline'
                                  disabled={cancelAssignmentMutation.isPending}
                                  onClick={() =>
                                    cancelAssignmentMutation.mutate(
                                      assignment.id
                                    )
                                  }
                                >
                                  {t('Cancel assignment')}
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <CreateBookDialog
          open={createBookOpen}
          onOpenChange={setCreateBookOpen}
        />
        {selectedBook ? (
          <CreateVersionDialog
            open={createVersionOpen}
            priceBookId={selectedBook.id}
            onOpenChange={setCreateVersionOpen}
          />
        ) : null}
        {selectedVersion ? (
          <GenerateItemsDialog
            open={generateOpen}
            versionId={selectedVersion.id}
            onOpenChange={setGenerateOpen}
          />
        ) : null}
        <AssignUserDialog
          open={assignOpen}
          books={books}
          onOpenChange={setAssignOpen}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
