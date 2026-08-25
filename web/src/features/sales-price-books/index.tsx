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
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { SectionPageLayout } from '@/components/layout'
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
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
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { downloadCSV } from '@/lib/download-csv'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  acceptSalesPriceBookItemReview,
  archiveSalesPriceBook,
  cancelUserPriceBookAssignment,
  cloneSalesPriceBookVersion,
  disableSalesPriceBook,
  deleteSalesPriceBookVersionDraft,
  enableSalesPriceBook,
  exportSalesPriceBookItems,
  getSalesPriceBookItems,
  getSalesPriceBooks,
  getSalesPriceBookVersions,
  getUserPriceBookAssignments,
  publishSalesPriceBookVersion,
  rejectSalesPriceBookItemReview,
  saveSalesPriceBookItem,
  setSalesPriceBookItemStatus,
  setDefaultSalesPriceBook,
  updateSalesPriceBook,
} from './api'
import { AssignUserDialog } from './components/assign-user-dialog'
import { ChangeBatchesPanel } from './components/change-batches-panel'
import { CreateBookDialog } from './components/create-book-dialog'
import { CreateVersionDialog } from './components/create-version-dialog'
import { EditBookDialog } from './components/edit-book-dialog'
import { EditPriceItemDialog } from './components/edit-price-item-dialog'
import { GenerateItemsDialog } from './components/generate-items-dialog'
import { ListPagination } from './components/list-pagination'
import { ReviewItemDialog } from './components/review-item-dialog'
import { VersionDiffCard } from './components/version-diff-card'
import type {
  SalesPriceBookAudience,
  SalesPriceBookItem,
  SalesPriceBookStatus,
  SalesPriceBookVersionStatus,
  UserPriceBookAssignment,
} from './types'

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
  const currentUser = useAuthStore((state) => state.auth.user)
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const [keyword, setKeyword] = useState('')
  const [bookAudience, setBookAudience] = useState<SalesPriceBookAudience | ''>(
    ''
  )
  const [bookStatus, setBookStatus] = useState<SalesPriceBookStatus | ''>('')
  const [bookPage, setBookPage] = useState(1)
  const [bookPageSize, setBookPageSize] = useState(200)
  const [assignmentKeyword, setAssignmentKeyword] = useState('')
  const [assignmentStatus, setAssignmentStatus] = useState<
    UserPriceBookAssignment['status'] | ''
  >('')
  const [assignmentPage, setAssignmentPage] = useState(1)
  const [assignmentPageSize, setAssignmentPageSize] = useState(200)
  const [selectedBookId, setSelectedBookId] = useState<number>()
  const [selectedVersionId, setSelectedVersionId] = useState<number>()
  const [createBookOpen, setCreateBookOpen] = useState(false)
  const [createVersionOpen, setCreateVersionOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [editBookId, setEditBookId] = useState<number>()
  const [editPriceItem, setEditPriceItem] = useState<SalesPriceBookItem>()
  const [reviewItem, setReviewItem] = useState<{
    id: number
    action: 'accept' | 'reject'
  }>()
  const [destructiveAction, setDestructiveAction] = useState<{
    type: 'disable' | 'archive' | 'delete-draft'
    id: number
  }>()
  const deferredKeyword = useDeferredValue(keyword)
  const deferredAssignmentKeyword = useDeferredValue(assignmentKeyword)

  const booksQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'list',
      deferredKeyword,
      bookAudience,
      bookStatus,
      bookPage,
      bookPageSize,
    ],
    queryFn: () =>
      getSalesPriceBooks({
        keyword: deferredKeyword.trim() || undefined,
        audience: bookAudience || undefined,
        status: bookStatus || undefined,
        p: bookPage,
        page_size: bookPageSize,
      }),
    placeholderData: keepPreviousData,
  })
  const books = booksQuery.data?.data.items ?? []
  const booksTotal = booksQuery.data?.data.total ?? 0
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
  const comparisonBaseVersion = selectedVersion
    ? versions.find((version) => version.version < selectedVersion.version)
    : undefined
  const selectedVersionQueryId = selectedVersion?.id ?? 0
  const itemsQuery = useQuery({
    queryKey: ['sales-price-books', 'items', selectedVersionQueryId],
    queryFn: () => getSalesPriceBookItems(selectedVersionQueryId),
    enabled: Boolean(selectedVersion),
  })
  const assignmentsQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'assignments',
      deferredAssignmentKeyword,
      assignmentStatus,
      assignmentPage,
      assignmentPageSize,
    ],
    queryFn: () =>
      getUserPriceBookAssignments({
        keyword: deferredAssignmentKeyword.trim() || undefined,
        status: assignmentStatus || undefined,
        p: assignmentPage,
        page_size: assignmentPageSize,
      }),
    placeholderData: keepPreviousData,
  })
  const assignmentBooksQuery = useQuery({
    queryKey: ['sales-price-books', 'list', 'assignment-options'],
    queryFn: () =>
      getSalesPriceBooks({
        audience: 'tob',
        status: 'enabled',
        p: 1,
        page_size: 200,
      }),
  })
  const assignments = assignmentsQuery.data?.data.items ?? []
  const assignmentsTotal = assignmentsQuery.data?.data.total ?? 0
  const assignmentBooks = assignmentBooksQuery.data?.data.items ?? []

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
  const acceptReviewMutation = useMutation({
    mutationFn: ({ itemId, comment }: { itemId: number; comment: string }) =>
      acceptSalesPriceBookItemReview(itemId, comment),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', selectedVersion?.id],
      })
      toast.success(t('Pricing risk accepted'))
      setReviewItem(undefined)
    },
    onError: handleServerError,
  })
  const rejectReviewMutation = useMutation({
    mutationFn: ({ itemId, comment }: { itemId: number; comment: string }) =>
      rejectSalesPriceBookItemReview(itemId, comment),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', selectedVersion?.id],
      })
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'change-batches'],
      })
      toast.success(t('Pricing risk rejected'))
      setReviewItem(undefined)
    },
    onError: handleServerError,
  })
  const itemStatusMutation = useMutation({
    mutationFn: ({ itemId, enabled }: { itemId: number; enabled: boolean }) =>
      setSalesPriceBookItemStatus(itemId, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', selectedVersion?.id],
      })
      toast.success(t('Model price status updated'))
    },
    onError: handleServerError,
  })
  const saveItemMutation = useMutation({
    mutationFn: saveSalesPriceBookItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', selectedVersion?.id],
      })
      setEditPriceItem(undefined)
      toast.success(t('Model sales price updated'))
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
      setDestructiveAction(undefined)
    },
    onError: handleServerError,
  })
  const updateBookMutation = useMutation({
    mutationFn: ({
      id,
      name,
      remark,
    }: {
      id: number
      name: string
      remark: string
    }) => updateSalesPriceBook(id, { name, remark }),
    onSuccess: async () => {
      await refreshBooks()
      setEditBookId(undefined)
      toast.success(t('Sales price book updated'))
    },
    onError: handleServerError,
  })
  const enableMutation = useMutation({
    mutationFn: enableSalesPriceBook,
    onSuccess: async () => {
      await refreshBooks()
      toast.success(t('Sales price book enabled'))
    },
    onError: handleServerError,
  })
  const archiveMutation = useMutation({
    mutationFn: archiveSalesPriceBook,
    onSuccess: async () => {
      await refreshBooks()
      toast.success(t('Sales price book archived'))
      setDestructiveAction(undefined)
    },
    onError: handleServerError,
  })
  const deleteDraftMutation = useMutation({
    mutationFn: deleteSalesPriceBookVersionDraft,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions', selectedBook?.id],
      })
      setSelectedVersionId(undefined)
      toast.success(t('Draft version deleted'))
      setDestructiveAction(undefined)
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
  const exportItemsMutation = useMutation({
    mutationFn: exportSalesPriceBookItems,
    onSuccess: (blob) => {
      if (!selectedBook || !selectedVersion) return
      downloadCSV(
        blob,
        `sales-price-book-${selectedBook.code}-v${selectedVersion.version}`
      )
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
              <TabsTrigger value='change-batches'>
                {t('Pricing change batches')}
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
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  <div className='grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]'>
                    <Input
                      value={keyword}
                      onChange={(event) => {
                        setKeyword(event.target.value)
                        setBookPage(1)
                      }}
                      placeholder={t('Search name or code')}
                      aria-label={t('Search name or code')}
                    />
                    <NativeSelect
                      aria-label={t('Audience')}
                      value={bookAudience}
                      onChange={(event) => {
                        setBookAudience(
                          event.target.value as SalesPriceBookAudience | ''
                        )
                        setBookPage(1)
                      }}
                    >
                      <NativeSelectOption value=''>
                        {t('All audiences')}
                      </NativeSelectOption>
                      <NativeSelectOption value='toc'>TOC</NativeSelectOption>
                      <NativeSelectOption value='tob'>TOB</NativeSelectOption>
                      <NativeSelectOption value='internal'>
                        {t('Internal')}
                      </NativeSelectOption>
                    </NativeSelect>
                    <NativeSelect
                      aria-label={t('Status')}
                      value={bookStatus}
                      onChange={(event) => {
                        setBookStatus(
                          event.target.value as SalesPriceBookStatus | ''
                        )
                        setBookPage(1)
                      }}
                    >
                      <NativeSelectOption value=''>
                        {t('All statuses')}
                      </NativeSelectOption>
                      <NativeSelectOption value='draft'>
                        {t('Draft')}
                      </NativeSelectOption>
                      <NativeSelectOption value='enabled'>
                        {t('Enabled')}
                      </NativeSelectOption>
                      <NativeSelectOption value='disabled'>
                        {t('Disabled')}
                      </NativeSelectOption>
                      <NativeSelectOption value='archived'>
                        {t('Archived')}
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  {booksQuery.isLoading ? (
                    <Skeleton className='h-40 w-full' />
                  ) : null}
                  {!booksQuery.isLoading && books.length === 0 ? (
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
                  {books.length > 0 ? (
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
                        {books.map((book) => (
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
                            <TableCell>
                              <div className='flex items-center gap-2'>
                                <span>{book.model_count}</span>
                                {book.audience === 'tob' &&
                                book.missing_model_count > 0 ? (
                                  <Badge variant='destructive'>
                                    {t('{{count}} missing', {
                                      count: book.missing_model_count,
                                    })}
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{book.assigned_users}</TableCell>
                            <TableCell>
                              <div className='flex gap-2'>
                                <Button
                                  size='sm'
                                  variant='outline'
                                  onClick={() => setEditBookId(book.id)}
                                >
                                  {t('Edit')}
                                </Button>
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
                                      setDestructiveAction({
                                        type: 'disable',
                                        id: book.id,
                                      })
                                    }
                                  >
                                    {t('Disable')}
                                  </Button>
                                ) : null}
                                {book.status === 'disabled' ? (
                                  <>
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      disabled={enableMutation.isPending}
                                      onClick={() =>
                                        enableMutation.mutate(book.id)
                                      }
                                    >
                                      {t('Enable')}
                                    </Button>
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      onClick={() =>
                                        setDestructiveAction({
                                          type: 'archive',
                                          id: book.id,
                                        })
                                      }
                                    >
                                      {t('Archive')}
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : null}
                  {!booksQuery.isLoading ? (
                    <ListPagination
                      page={bookPage}
                      pageSize={bookPageSize}
                      total={booksTotal}
                      isFetching={booksQuery.isFetching}
                      onPageChange={setBookPage}
                      onPageSizeChange={(pageSize) => {
                        setBookPageSize(pageSize)
                        setBookPage(1)
                      }}
                    />
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
                                      <Button
                                        size='sm'
                                        variant='destructive'
                                        onClick={() =>
                                          setDestructiveAction({
                                            type: 'delete-draft',
                                            id: version.id,
                                          })
                                        }
                                      >
                                        {t('Delete draft')}
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
                    {canExport ? (
                      <CardAction>
                        <Button
                          size='sm'
                          variant='outline'
                          disabled={exportItemsMutation.isPending}
                          onClick={() =>
                            exportItemsMutation.mutate(selectedVersion.id)
                          }
                        >
                          <Download data-icon='inline-start' />
                          {t('Export model pricing')}
                        </Button>
                      </CardAction>
                    ) : null}
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
                            <TableHead>{t('Actions')}</TableHead>
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
                              <TableCell>
                                {selectedVersion.status === 'draft' ? (
                                  <div className='flex flex-wrap gap-2'>
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      onClick={() => setEditPriceItem(item)}
                                    >
                                      {t('Edit')}
                                    </Button>
                                    {item.status === 'review_required' ? (
                                      <>
                                        <Button
                                          size='sm'
                                          variant='outline'
                                          onClick={() =>
                                            setReviewItem({
                                              id: item.id,
                                              action: 'accept',
                                            })
                                          }
                                        >
                                          {t('Accept risk')}
                                        </Button>
                                        <Button
                                          size='sm'
                                          variant='destructive'
                                          onClick={() =>
                                            setReviewItem({
                                              id: item.id,
                                              action: 'reject',
                                            })
                                          }
                                        >
                                          {t('Reject')}
                                        </Button>
                                      </>
                                    ) : (
                                      <Button
                                        size='sm'
                                        variant='outline'
                                        disabled={itemStatusMutation.isPending}
                                        onClick={() =>
                                          itemStatusMutation.mutate({
                                            itemId: item.id,
                                            enabled: item.status !== 'enabled',
                                          })
                                        }
                                      >
                                        {item.status === 'enabled'
                                          ? t('Disable')
                                          : t('Enable')}
                                      </Button>
                                    )}
                                  </div>
                                ) : null}
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

              {selectedVersion && comparisonBaseVersion ? (
                <VersionDiffCard
                  baseVersion={comparisonBaseVersion}
                  targetVersion={selectedVersion}
                />
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
                <CardContent className='flex flex-col gap-4'>
                  <div className='grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px]'>
                    <Input
                      value={assignmentKeyword}
                      onChange={(event) => {
                        setAssignmentKeyword(event.target.value)
                        setAssignmentPage(1)
                      }}
                      placeholder={t('Search username, quote, or contract')}
                      aria-label={t('Search username, quote, or contract')}
                    />
                    <NativeSelect
                      aria-label={t('Status')}
                      value={assignmentStatus}
                      onChange={(event) => {
                        setAssignmentStatus(
                          event.target.value as
                            | UserPriceBookAssignment['status']
                            | ''
                        )
                        setAssignmentPage(1)
                      }}
                    >
                      <NativeSelectOption value=''>
                        {t('All statuses')}
                      </NativeSelectOption>
                      <NativeSelectOption value='scheduled'>
                        {t('Scheduled')}
                      </NativeSelectOption>
                      <NativeSelectOption value='active'>
                        {t('Active')}
                      </NativeSelectOption>
                      <NativeSelectOption value='expired'>
                        {t('Expired')}
                      </NativeSelectOption>
                      <NativeSelectOption value='cancelled'>
                        {t('Cancelled')}
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  {assignmentsQuery.isLoading ? (
                    <Skeleton className='h-40 w-full' />
                  ) : null}
                  {assignments.length > 0 ? (
                    <Table className='min-w-[70rem]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('Username')}</TableHead>
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
                        {assignments.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell className='font-medium'>
                              {assignment.username}
                            </TableCell>
                            <TableCell>{assignment.user_id}</TableCell>
                            <TableCell>
                              {assignment.price_book_name ||
                                assignment.price_book_id}
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
                  {!assignmentsQuery.isLoading ? (
                    <ListPagination
                      page={assignmentPage}
                      pageSize={assignmentPageSize}
                      total={assignmentsTotal}
                      isFetching={assignmentsQuery.isFetching}
                      onPageChange={setAssignmentPage}
                      onPageSizeChange={(pageSize) => {
                        setAssignmentPageSize(pageSize)
                        setAssignmentPage(1)
                      }}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value='change-batches' className='mt-4'>
              <ChangeBatchesPanel />
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
          books={assignmentBooks}
          onOpenChange={setAssignOpen}
        />
        <EditBookDialog
          book={books.find((book) => book.id === editBookId)}
          pending={updateBookMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setEditBookId(undefined)
          }}
          onSubmit={(name, remark) => {
            if (editBookId) {
              updateBookMutation.mutate({ id: editBookId, name, remark })
            }
          }}
        />
        <ReviewItemDialog
          itemId={reviewItem?.id}
          action={reviewItem?.action ?? 'accept'}
          pending={
            acceptReviewMutation.isPending || rejectReviewMutation.isPending
          }
          onOpenChange={(open) => {
            if (!open) setReviewItem(undefined)
          }}
          onSubmit={(itemId, comment) => {
            if (reviewItem?.action === 'reject') {
              rejectReviewMutation.mutate({ itemId, comment })
              return
            }
            acceptReviewMutation.mutate({ itemId, comment })
          }}
        />
        <EditPriceItemDialog
          item={editPriceItem}
          pending={saveItemMutation.isPending}
          onOpenChange={(open) => {
            if (!open) setEditPriceItem(undefined)
          }}
          onSubmit={(item) => saveItemMutation.mutate(item)}
        />
        <AlertDialog
          open={Boolean(destructiveAction)}
          onOpenChange={(open) => {
            if (!open) setDestructiveAction(undefined)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('Confirm pricing change')}</AlertDialogTitle>
              <AlertDialogDescription>
                {destructiveAction?.type === 'delete-draft'
                  ? t(
                      'This draft and its model prices will be permanently deleted.'
                    )
                  : t(
                      'The server will block this action if the price book is still assigned or is the TOC default.'
                    )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  if (!destructiveAction) return
                  if (destructiveAction.type === 'disable') {
                    disableMutation.mutate(destructiveAction.id)
                  } else if (destructiveAction.type === 'archive') {
                    archiveMutation.mutate(destructiveAction.id)
                  } else {
                    deleteDraftMutation.mutate(destructiveAction.id)
                  }
                }}
              >
                {t('Confirm')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
