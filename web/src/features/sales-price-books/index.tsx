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
import { useDeferredValue, useEffect, useState } from 'react'
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
  EmptyContent,
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
  compareSalesPriceBookVersions,
  disableSalesPriceBook,
  deleteSalesPriceBookItems,
  deleteSalesPriceBookVersionDraft,
  enableSalesPriceBook,
  exportSalesPriceBookChannelModels,
  exportSalesPriceBookItems,
  getDefaultSalesPriceBook,
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
import { ModelPriceTable } from './components/model-price-table'
import { PriceBookAuditPanel } from './components/price-book-audit-panel'
import {
  PriceBookSelectionAction,
  SelectablePriceBookRow,
} from './components/price-book-selection'
import { PriceBookStatusBadges } from './components/price-book-status'
import { PriceBookSummary } from './components/price-book-summary'
import { PriceBookVersionTable } from './components/price-book-version-table'
import {
  PublishVersionDialog,
  type PublishVersionCandidate,
} from './components/publish-version-dialog'
import { ReviewItemDialog } from './components/review-item-dialog'
import { VersionDiffCard } from './components/version-diff-card'
import { pricingRiskLabel } from './lib/pricing-risk'
import { getSalesPriceBookPublicationIssue } from './lib/publication-check'
import {
  readSalesPriceBookSelection,
  writeSalesPriceBookSelection,
} from './lib/selection-storage'
import { getSalesPriceBookComparisonBase } from './lib/version-comparison'
import type {
  SalesPriceBook,
  SalesPriceBookAudience,
  SalesPriceBookItem,
  SalesPriceBookStatus,
  SalesPriceBookVersion,
  UserPriceBookAssignment,
} from './types'

function PriceBookCoverageBadge(props: {
  book: SalesPriceBook
  t: (key: string, values?: Record<string, number>) => string
}) {
  if (props.book.audience !== 'tob' || props.book.missing_model_count <= 0) {
    return null
  }
  if (!props.book.current_version_id) {
    return (
      <Badge variant='outline'>
        {props.t('Setup pending · {{count}} sellable models', {
          count: props.book.missing_model_count,
        })}
      </Badge>
    )
  }
  return (
    <Badge variant='destructive'>
      {props.t('{{count}} missing', {
        count: props.book.missing_model_count,
      })}
    </Badge>
  )
}

function assignmentStatusLabel(
  status: UserPriceBookAssignment['status'],
  t: (key: string) => string
) {
  if (status === 'scheduled') return t('Scheduled')
  if (status === 'active') return t('Active')
  if (status === 'expired') return t('Expired')
  return t('Cancelled')
}

export type SalesPriceBooksTab = 'books' | 'assignments' | 'change-batches'

type SalesPriceBooksProps = {
  activeTab?: SalesPriceBooksTab
  onTabChange?: (tab: SalesPriceBooksTab) => void
}

export function SalesPriceBooks(props: SalesPriceBooksProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const canWrite = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.WRITE
  )
  const canPublish = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.PUBLISH
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
  const [selection, setSelection] = useState(() =>
    readSalesPriceBookSelection(
      typeof window === 'undefined' ? undefined : window.sessionStorage
    )
  )
  const selectedBookId = selection.bookId
  const selectedVersionId = selection.versionId
  const setSelectedBookId = (bookId: number | undefined) => {
    setSelection((current) => ({ ...current, bookId }))
  }
  const setSelectedVersionId = (versionId: number | undefined) => {
    setSelection((current) => ({ ...current, versionId }))
  }
  const [createBookOpen, setCreateBookOpen] = useState(false)
  const [createVersionBookId, setCreateVersionBookId] = useState<number>()
  const [editVersion, setEditVersion] = useState<SalesPriceBookVersion>()
  const [generateTarget, setGenerateTarget] = useState<{
    id: number
    label: string
    version: SalesPriceBookVersion
    initialChannelModelIds?: number[]
  }>()
  const [assignOpen, setAssignOpen] = useState(false)
  const [editBookId, setEditBookId] = useState<number>()
  const [editPriceItem, setEditPriceItem] = useState<SalesPriceBookItem>()
  const [reviewItem, setReviewItem] = useState<{
    id: number
    action: 'accept' | 'reject'
    reason: string
    detail: string
  }>()
  const [publishCandidate, setPublishCandidate] =
    useState<PublishVersionCandidate>()
  const [cancelAssignment, setCancelAssignment] =
    useState<UserPriceBookAssignment>()
  const [destructiveAction, setDestructiveAction] = useState<{
    type: 'disable' | 'archive' | 'delete-draft'
    id: number
  }>()
  const deferredKeyword = useDeferredValue(keyword)
  const deferredAssignmentKeyword = useDeferredValue(assignmentKeyword)

  useEffect(() => {
    writeSalesPriceBookSelection(window.sessionStorage, selection)
  }, [selection])

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
  const defaultBookQuery = useQuery({
    queryKey: ['sales-price-books', 'default', 'toc_default'],
    queryFn: getDefaultSalesPriceBook,
    retry: false,
  })
  const tocDefaultPriceBookId = defaultBookQuery.data?.data.price_book_id
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
    versions.find((version) => version.id === selectedVersionId) ??
    versions.find(
      (version) => version.id === selectedBook?.current_version_id
    ) ??
    versions.find((version) => version.status === 'active') ??
    versions[0]
  const comparisonBaseVersion = getSalesPriceBookComparisonBase(
    versions,
    selectedVersion,
    selectedBook?.current_version_id
  )
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
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'list'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'audit-records'],
      }),
    ])
  }
  const refreshSelectedVersionPrices = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', selectedVersion?.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'version-diff'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'audit-records'],
      }),
    ])
  }
  const publishMutation = useMutation({
    mutationFn: publishSalesPriceBookVersion,
    onSuccess: async () => {
      await refreshBooks()
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions'],
      })
      setPublishCandidate(undefined)
      toast.success(t('Price book version published'))
    },
    onError: handleServerError,
  })
  const requestVersionPublish = async (versionId: number) => {
    setSelectedVersionId(versionId)
    try {
      const response = await queryClient.fetchQuery({
        queryKey: ['sales-price-books', 'items', versionId],
        queryFn: () => getSalesPriceBookItems(versionId),
      })
      const issue = getSalesPriceBookPublicationIssue(response.data ?? [])
      if (issue?.type === 'empty') {
        toast.warning(t('No model prices in this version'), {
          description: t(
            'Generate prices from selected channel models before publishing.'
          ),
        })
        return
      }
      if (issue?.type === 'review') {
        toast.warning(
          t('{{count}} model prices require review', {
            count: issue.items.length,
          }),
          {
            description: issue.items
              .slice(0, 3)
              .map(
                (item) =>
                  `${item.model_name}: ${pricingRiskLabel(item.review_risk_code ?? '', t)}`
              )
              .join('；'),
          }
        )
        return
      }
      const version = versions.find((item) => item.id === versionId)
      if (!selectedBook || !version) {
        toast.error(t('The selected price book version is unavailable'))
        return
      }
      let diff
      const baseVersion = getSalesPriceBookComparisonBase(
        versions,
        version,
        selectedBook.current_version_id
      )
      if (baseVersion && baseVersion.id !== version.id) {
        const diffResponse = await queryClient.fetchQuery({
          queryKey: [
            'sales-price-books',
            'version-diff',
            baseVersion.id,
            version.id,
          ],
          queryFn: () =>
            compareSalesPriceBookVersions(baseVersion.id, version.id),
        })
        diff = diffResponse.data
      }
      setPublishCandidate({
        book: selectedBook,
        version,
        items: response.data ?? [],
        diff,
      })
    } catch (error) {
      handleServerError(error)
    }
  }
  const acceptReviewMutation = useMutation({
    mutationFn: ({ itemId, comment }: { itemId: number; comment: string }) =>
      acceptSalesPriceBookItemReview(itemId, comment),
    onSuccess: async () => {
      await refreshSelectedVersionPrices()
      toast.success(t('Pricing risk accepted'))
      setReviewItem(undefined)
    },
    onError: handleServerError,
  })
  const rejectReviewMutation = useMutation({
    mutationFn: ({ itemId, comment }: { itemId: number; comment: string }) =>
      rejectSalesPriceBookItemReview(itemId, comment),
    onSuccess: async () => {
      await refreshSelectedVersionPrices()
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
      await refreshSelectedVersionPrices()
      toast.success(t('Model price status updated'))
    },
    onError: handleServerError,
  })
  const saveItemMutation = useMutation({
    mutationFn: saveSalesPriceBookItem,
    onSuccess: async () => {
      await refreshSelectedVersionPrices()
      setEditPriceItem(undefined)
      toast.success(t('Model sales price updated'))
    },
    onError: handleServerError,
  })
  const deleteItemMutation = useMutation({
    mutationFn: deleteSalesPriceBookItems,
    onSuccess: async () => {
      await Promise.all([refreshSelectedVersionPrices(), refreshBooks()])
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'change-batches'],
      })
      toast.success(t('Model sales prices deleted'))
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'versions', selectedBook?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'audit-records'],
        }),
      ])
      setSelectedVersionId(response.data.id)
      toast.success(t('Historical version restored as a new draft'))
    },
    onError: handleServerError,
  })
  const defaultMutation = useMutation({
    mutationFn: setDefaultSalesPriceBook,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'default', 'toc_default'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'audit-records'],
        }),
      ])
      toast.success(t('TOC default price book updated'))
    },
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'versions', selectedBook?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'audit-records'],
        }),
      ])
      setSelectedVersionId(undefined)
      toast.success(t('Draft version deleted'))
      setDestructiveAction(undefined)
    },
    onError: handleServerError,
  })
  const cancelAssignmentMutation = useMutation({
    mutationFn: cancelUserPriceBookAssignment,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['sales-price-books', 'assignments'],
        }),
        refreshBooks(),
      ])
      toast.success(t('Price book assignment cancelled'))
      setCancelAssignment(undefined)
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
  const exportChannelModelsMutation = useMutation({
    mutationFn: exportSalesPriceBookChannelModels,
    onSuccess: (blob) => {
      if (!selectedBook || !selectedVersion) return
      downloadCSV(
        blob,
        `sales-price-book-${selectedBook.code}-v${selectedVersion.version}-channel-models`
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
        {canWrite ? (
          <Button onClick={() => setCreateBookOpen(true)}>
            {t('Create price book')}
          </Button>
        ) : null}
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='flex min-w-0 flex-col gap-4'>
          <Alert>
            <AlertTitle>
              {t('Purchase price → Price book → Customer billing')}
            </AlertTitle>
            <AlertDescription>
              {t(
                'Maintain upstream purchase costs first, generate a draft price-book version, then publish it. Customers only use the active version.'
              )}
            </AlertDescription>
          </Alert>
          <Tabs
            defaultValue='books'
            value={props.activeTab}
            onValueChange={(value) =>
              props.onTabChange?.(value as SalesPriceBooksTab)
            }
          >
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
                  <CardTitle>{t('1. Choose a price book')}</CardTitle>
                  <CardDescription>
                    {t(
                      'Choose a customer-facing price policy. TOC defaults apply automatically; TOB price books are assigned to users.'
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
                          <TableHead className='bg-card sticky left-0 z-10'>
                            {t('Name')}
                          </TableHead>
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
                        {books.map((book) => {
                          const isSelected = selectedBook?.id === book.id
                          const isTocDefault = tocDefaultPriceBookId === book.id
                          const selectBook = () => {
                            if (isSelected) {
                              return
                            }
                            setSelectedBookId(book.id)
                            setSelectedVersionId(undefined)
                          }

                          return (
                            <SelectablePriceBookRow
                              key={book.id}
                              selected={isSelected}
                              onSelect={selectBook}
                            >
                              <TableCell className='bg-card sticky left-0 z-10'>
                                <span className='font-medium'>{book.name}</span>
                              </TableCell>
                              <TableCell>{book.code}</TableCell>
                              <TableCell>
                                {book.audience.toUpperCase()}
                              </TableCell>
                              <TableCell>
                                <PriceBookStatusBadges
                                  status={book.status}
                                  isTocDefault={isTocDefault}
                                />
                              </TableCell>
                              <TableCell>
                                {book.current_version
                                  ? `v${book.current_version.version}`
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                <div className='flex items-center gap-2'>
                                  <span>{book.model_count}</span>
                                  <PriceBookCoverageBadge book={book} t={t} />
                                </div>
                              </TableCell>
                              <TableCell>{book.assigned_users}</TableCell>
                              <TableCell>
                                <div className='flex gap-2'>
                                  <PriceBookSelectionAction
                                    selected={isSelected}
                                    onSelect={selectBook}
                                  />
                                  {canWrite ? (
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      onClick={() => setEditBookId(book.id)}
                                    >
                                      {t('Edit')}
                                    </Button>
                                  ) : null}
                                  {book.audience === 'toc' &&
                                  book.status === 'enabled' &&
                                  !isTocDefault &&
                                  canPublish ? (
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
                                  book.status !== 'archived' &&
                                  canPublish ? (
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
                                  {book.status === 'disabled' && canPublish ? (
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
                            </SelectablePriceBookRow>
                          )
                        })}
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

              {selectedBook ? <PriceBookSummary book={selectedBook} /> : null}

              {selectedBook ? (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('2. Manage pricing versions')}</CardTitle>
                    <CardDescription>
                      {t(
                        'The active version is used for billing. Drafts can be edited safely until they are published.'
                      )}
                    </CardDescription>
                    {canWrite ? (
                      <CardAction>
                        <Button
                          size='sm'
                          onClick={() =>
                            setCreateVersionBookId(selectedBook.id)
                          }
                        >
                          {versions.length === 0
                            ? t('Create first draft version')
                            : t('Create draft version')}
                        </Button>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4'>
                    {versionsQuery.isLoading ? (
                      <Skeleton className='h-32 w-full' />
                    ) : null}
                    {versions.length > 0 ? (
                      <PriceBookVersionTable
                        versions={versions}
                        currentVersionId={selectedBook.current_version_id}
                        selectedVersionId={selectedVersion?.id}
                        isPublishing={publishMutation.isPending}
                        isCloning={cloneMutation.isPending}
                        canWrite={canWrite}
                        canPublish={canPublish}
                        onSelect={setSelectedVersionId}
                        onGenerate={(versionId) => {
                          setSelectedVersionId(versionId)
                          const version = versions.find(
                            (item) => item.id === versionId
                          )
                          if (!version) return
                          setGenerateTarget({
                            id: versionId,
                            label: `${selectedBook.name} / v${version.version}`,
                            version,
                          })
                        }}
                        onPublish={requestVersionPublish}
                        onEditPolicy={(version) => {
                          setEditVersion(version)
                          setCreateVersionBookId(selectedBook.id)
                        }}
                        onDeleteDraft={(versionId) =>
                          setDestructiveAction({
                            type: 'delete-draft',
                            id: versionId,
                          })
                        }
                        onClone={(versionId) =>
                          cloneMutation.mutate({
                            bookId: selectedBook.id,
                            versionId,
                          })
                        }
                      />
                    ) : null}
                    {!versionsQuery.isLoading && versions.length === 0 ? (
                      <Empty className='min-h-64 border'>
                        <EmptyHeader>
                          <EmptyTitle>
                            {t('This price book is not configured yet')}
                          </EmptyTitle>
                          <EmptyDescription>
                            {t(
                              'Creating a price book only creates the customer group. Complete these steps before assigning users.'
                            )}
                          </EmptyDescription>
                        </EmptyHeader>
                        <EmptyContent>
                          <ol className='text-muted-foreground grid gap-2 text-left text-sm'>
                            <li>
                              {t('1. Create a draft with pricing parameters')}
                            </li>
                            <li>
                              {t(
                                '2. Generate model prices from channel purchase costs'
                              )}
                            </li>
                            <li>
                              {t('3. Review and publish the active version')}
                            </li>
                          </ol>
                          {canWrite ? (
                            <Button
                              onClick={() =>
                                setCreateVersionBookId(selectedBook.id)
                              }
                            >
                              {t('Configure the first version')}
                            </Button>
                          ) : null}
                        </EmptyContent>
                      </Empty>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {selectedVersion ? (
                <ModelPriceTable
                  version={selectedVersion}
                  items={itemsQuery.data?.data ?? []}
                  isLoading={itemsQuery.isLoading}
                  canExport={canExport}
                  canWrite={canWrite}
                  canPublish={canPublish}
                  isExporting={exportItemsMutation.isPending}
                  isExportingChannelModels={
                    exportChannelModelsMutation.isPending
                  }
                  isDeleting={deleteItemMutation.isPending}
                  isUpdatingStatus={itemStatusMutation.isPending}
                  onExport={() =>
                    exportItemsMutation.mutate(selectedVersion.id)
                  }
                  onExportChannelModels={() =>
                    exportChannelModelsMutation.mutate(selectedVersion.id)
                  }
                  onEdit={setEditPriceItem}
                  onDelete={(itemIds) =>
                    deleteItemMutation.mutateAsync(
                      Array.isArray(itemIds) ? itemIds : [itemIds]
                    )
                  }
                  onReview={(item, action) =>
                    setReviewItem({
                      id: item.id,
                      action,
                      reason: pricingRiskLabel(item.review_risk_code ?? '', t),
                      detail: item.review_reason ?? '',
                    })
                  }
                  onRegenerate={(item) =>
                    setGenerateTarget({
                      id: selectedVersion.id,
                      label: `${selectedBook.name} / v${selectedVersion.version}`,
                      version: selectedVersion,
                      initialChannelModelIds: (item.channel_margins ?? []).map(
                        (margin) => margin.channel_model_id
                      ),
                    })
                  }
                  onSetEnabled={(itemId, enabled) =>
                    itemStatusMutation.mutate({ itemId, enabled })
                  }
                />
              ) : null}

              {selectedVersion && comparisonBaseVersion ? (
                <VersionDiffCard
                  baseVersion={comparisonBaseVersion}
                  targetVersion={selectedVersion}
                />
              ) : null}

              {selectedBook ? (
                <PriceBookAuditPanel priceBookId={selectedBook.id} />
              ) : null}
            </TabsContent>

            <TabsContent value='assignments' className='mt-4'>
              <Card>
                <CardHeader>
                  <CardTitle>{t('User assignments')}</CardTitle>
                  <CardDescription>
                    {t('Bind TOB users directly to a reusable price book.')}
                  </CardDescription>
                  {canWrite ? (
                    <CardAction>
                      <Button onClick={() => setAssignOpen(true)}>
                        {t('Assign user')}
                      </Button>
                    </CardAction>
                  ) : null}
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
                    <Table className='min-w-[86rem]'>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='bg-card sticky left-0 z-10'>
                            {t('Username')}
                          </TableHead>
                          <TableHead>{t('User ID')}</TableHead>
                          <TableHead>{t('Sales price book')}</TableHead>
                          <TableHead>{t('Version policy')}</TableHead>
                          <TableHead>{t('Status')}</TableHead>
                          <TableHead>{t('Effective from')}</TableHead>
                          <TableHead>{t('Effective to')}</TableHead>
                          <TableHead>{t('Quote reference')}</TableHead>
                          <TableHead>{t('Contract reference')}</TableHead>
                          <TableHead>{t('Actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assignments.map((assignment) => (
                          <TableRow key={assignment.id}>
                            <TableCell className='bg-card sticky left-0 z-10 font-medium'>
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
                                : `${t('Pin contract version')} · v${assignment.pinned_version_number || assignment.pinned_version_id}`}
                            </TableCell>
                            <TableCell>
                              {assignmentStatusLabel(assignment.status, t)}
                            </TableCell>
                            <TableCell>
                              {new Date(
                                assignment.effective_from * 1000
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {assignment.effective_to > 0
                                ? new Date(
                                    assignment.effective_to * 1000
                                  ).toLocaleString()
                                : t('No expiration')}
                            </TableCell>
                            <TableCell>
                              {assignment.quote_reference || '—'}
                            </TableCell>
                            <TableCell>
                              {assignment.contract_reference || '—'}
                            </TableCell>
                            <TableCell>
                              {(assignment.status === 'active' ||
                                assignment.status === 'scheduled') &&
                              canWrite ? (
                                <Button
                                  size='sm'
                                  variant='outline'
                                  disabled={cancelAssignmentMutation.isPending}
                                  onClick={() =>
                                    setCancelAssignment(assignment)
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
              <ChangeBatchesPanel canWrite={canWrite} canPublish={canPublish} />
            </TabsContent>
          </Tabs>
        </div>

        <CreateBookDialog
          open={createBookOpen}
          onOpenChange={setCreateBookOpen}
          onCreated={(book) => {
            setSelectedBookId(book.id)
            setSelectedVersionId(undefined)
            setCreateVersionBookId(book.id)
          }}
        />
        {createVersionBookId ? (
          <CreateVersionDialog
            open
            priceBookId={createVersionBookId}
            version={editVersion}
            onOpenChange={(open) => {
              if (!open) {
                setCreateVersionBookId(undefined)
                setEditVersion(undefined)
              }
            }}
            onSaved={(version) => {
              setSelectedVersionId(version.id)
              setGenerateTarget({
                id: version.id,
                label: `${selectedBook?.name ?? ''} / v${version.version}`,
                version,
              })
            }}
          />
        ) : null}
        {generateTarget ? (
          <GenerateItemsDialog
            open
            versionId={generateTarget.id}
            version={generateTarget.version}
            versionLabel={generateTarget.label}
            initialChannelModelIds={generateTarget.initialChannelModelIds}
            onOpenChange={(open) => {
              if (!open) setGenerateTarget(undefined)
            }}
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
          reason={reviewItem?.reason ?? ''}
          detail={reviewItem?.detail ?? ''}
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
        <PublishVersionDialog
          candidate={publishCandidate}
          pending={publishMutation.isPending}
          onOpenChange={(open) => {
            if (!open && !publishMutation.isPending) {
              setPublishCandidate(undefined)
            }
          }}
          onConfirm={(versionId) => publishMutation.mutate(versionId)}
        />
        <AlertDialog
          open={Boolean(cancelAssignment)}
          onOpenChange={(open) => {
            if (!open && !cancelAssignmentMutation.isPending) {
              setCancelAssignment(undefined)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('Cancel user price book assignment')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'User {{username}} will stop using {{book}} and return to the applicable default pricing policy.',
                  {
                    username: cancelAssignment?.username ?? '',
                    book:
                      cancelAssignment?.price_book_name ??
                      cancelAssignment?.price_book_id ??
                      '',
                  }
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelAssignmentMutation.isPending}>
                {t('Keep assignment')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant='destructive'
                disabled={cancelAssignmentMutation.isPending}
                onClick={(event) => {
                  event.preventDefault()
                  if (cancelAssignment) {
                    cancelAssignmentMutation.mutate(cancelAssignment.id)
                  }
                }}
              >
                {t('Cancel assignment')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
