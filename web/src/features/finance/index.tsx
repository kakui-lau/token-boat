import {
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Download, RefreshCw } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { completeOrder } from '@/features/wallet/api'
import type { TopupOrderType, TopupStatus } from '@/features/wallet/types'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  exportFinanceOrders,
  getFinanceOrders,
  getFinanceOverview,
} from './api'
import { FinanceAlertsPanel } from './components/finance-alerts-panel'
import { FinanceOverviewPanel } from './components/finance-overview'
import { FinanceTrendReport } from './components/finance-trend-report'
import { PaymentCallbackEvents } from './components/payment-callback-events'
import { PaymentChannelTable } from './components/payment-channel-table'
import { RechargeOrdersTable } from './components/recharge-orders-table'
import { UserFundsPanel } from './components/user-funds-panel'
import type { FinanceOrderFilters, FinancePeriod } from './types'

const ORDER_PAGE_SIZE = 20

export function Finance() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const financeFetchingCount = useIsFetching({ queryKey: ['finance'] })
  const currentUser = useAuthStore((state) => state.auth.user)
  const canOperate = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.FINANCE,
    ADMIN_PERMISSION_ACTIONS.OPERATE
  )
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.FINANCE,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const [period, setPeriod] = useState<FinancePeriod>('30d')
  const [activeTab, setActiveTab] = useState('overview')
  const [keyword, setKeyword] = useState('')
  const deferredKeyword = useDeferredValue(keyword.trim())
  const [status, setStatus] = useState<TopupStatus | 'all'>('all')
  const [provider, setProvider] = useState('all')
  const [orderType, setOrderType] = useState<TopupOrderType | 'all'>('all')
  const [page, setPage] = useState(1)
  const [confirmTradeNo, setConfirmTradeNo] = useState<string | null>(null)
  const [completionReason, setCompletionReason] = useState('')

  const filters: FinanceOrderFilters = {
    period,
    keyword: deferredKeyword || undefined,
    status: status === 'all' ? undefined : status,
    provider: provider === 'all' ? undefined : provider,
    orderType: orderType === 'all' ? undefined : orderType,
  }

  const overviewQuery = useQuery({
    queryKey: ['finance', 'overview', period],
    queryFn: async () => {
      const response = await getFinanceOverview(period)
      if (!response.success) {
        throw new Error(response.message || t('Failed to load finance data.'))
      }
      return response.data
    },
    staleTime: 30_000,
    enabled: activeTab === 'overview',
  })

  const ordersQuery = useQuery({
    queryKey: [
      'finance',
      'orders',
      period,
      deferredKeyword,
      status,
      provider,
      orderType,
      page,
    ],
    queryFn: async () => {
      const response = await getFinanceOrders(filters, page, ORDER_PAGE_SIZE)
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to load recharge orders.')
        )
      }
      return response.data
    },
    placeholderData: (previous) => previous,
    enabled: activeTab === 'overview',
  })

  const completeMutation = useMutation({
    mutationFn: async (request: { tradeNo: string; reason: string }) => {
      const response = await completeOrder({
        trade_no: request.tradeNo,
        reason: request.reason,
      })
      if (!response.success) {
        throw new Error(response.message || t('Failed to complete order'))
      }
      return response
    },
    onSuccess: async () => {
      setConfirmTradeNo(null)
      setCompletionReason('')
      toast.success(t('Order completed successfully'))
      await queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
    onError: handleServerError,
  })

  const exportMutation = useMutation({
    mutationFn: () => exportFinanceOrders(filters),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `recharge-orders-${new Date()
        .toISOString()
        .slice(0, 10)
        .replaceAll('-', '')}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    },
    onError: handleServerError,
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }

  const updatePeriod = (value: FinancePeriod) => {
    setPeriod(value)
    setPage(1)
  }

  const updateStatus = (value: TopupStatus | 'all') => {
    setStatus(value)
    setPage(1)
  }

  const updateProvider = (value: string) => {
    setProvider(value)
    setPage(1)
  }

  const updateOrderType = (value: TopupOrderType | 'all') => {
    setOrderType(value)
    setPage(1)
  }

  const updateKeyword = (value: string) => {
    setKeyword(value)
    setPage(1)
  }

  const openCompletionDialog = (tradeNo: string) => {
    setConfirmTradeNo(tradeNo)
    setCompletionReason('')
  }

  const hasOverviewError = overviewQuery.isError && !overviewQuery.data

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>
          {t('Financial Operations')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Select
            value={period}
            onValueChange={(value) =>
              value !== null && updatePeriod(value as FinancePeriod)
            }
          >
            <SelectTrigger className='w-36' aria-label={t('Reporting period')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value='7d'>{t('Last 7 days')}</SelectItem>
                <SelectItem value='30d'>{t('Last 30 days')}</SelectItem>
                <SelectItem value='90d'>{t('Last 90 days')}</SelectItem>
                <SelectItem value='all'>{t('All time')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {canExport && activeTab === 'overview' ? (
            <Button
              variant='outline'
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              <Download data-icon='inline-start' aria-hidden='true' />
              {t('Export CSV')}
            </Button>
          ) : null}
          <Button
            variant='outline'
            disabled={financeFetchingCount > 0}
            onClick={() => void refresh()}
          >
            <RefreshCw
              data-icon='inline-start'
              className={financeFetchingCount > 0 ? 'animate-spin' : undefined}
              aria-hidden='true'
            />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='mx-auto w-full max-w-[1600px] space-y-4'>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Monitor balances, payment callbacks, revenue trends, user funds, and financial anomalies.'
              )}
            </p>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className='h-auto w-full justify-start overflow-x-auto p-1'>
                <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
                <TabsTrigger value='trends'>
                  {t('Financial trends')}
                </TabsTrigger>
                <TabsTrigger value='callbacks'>
                  {t('Payment callbacks')}
                </TabsTrigger>
                <TabsTrigger value='users'>{t('User funds')}</TabsTrigger>
                <TabsTrigger value='alerts'>{t('Anomaly alerts')}</TabsTrigger>
              </TabsList>

              <TabsContent value='overview' className='space-y-4 pt-2'>
                {hasOverviewError ? (
                  <ErrorState
                    title={t('Failed to load finance data.')}
                    description={
                      overviewQuery.error instanceof Error
                        ? overviewQuery.error.message
                        : undefined
                    }
                    onRetry={() => void overviewQuery.refetch()}
                    className='min-h-56'
                  />
                ) : (
                  <>
                    <FinanceOverviewPanel
                      data={overviewQuery.data}
                      loading={overviewQuery.isLoading}
                    />
                    <PaymentChannelTable
                      providers={overviewQuery.data?.providers ?? []}
                    />
                  </>
                )}

                <RechargeOrdersTable
                  rows={ordersQuery.data?.items ?? []}
                  total={ordersQuery.data?.total ?? 0}
                  page={page}
                  pageSize={ORDER_PAGE_SIZE}
                  keyword={keyword}
                  status={status}
                  provider={provider}
                  orderType={orderType}
                  providers={
                    overviewQuery.data?.providers.map(
                      (item) => item.provider
                    ) ?? []
                  }
                  loading={ordersQuery.isLoading}
                  error={
                    ordersQuery.error instanceof Error
                      ? ordersQuery.error.message
                      : undefined
                  }
                  completing={completeMutation.isPending}
                  canComplete={canOperate}
                  onKeywordChange={updateKeyword}
                  onStatusChange={updateStatus}
                  onProviderChange={updateProvider}
                  onOrderTypeChange={updateOrderType}
                  onPageChange={setPage}
                  onComplete={openCompletionDialog}
                  onRetry={() => void ordersQuery.refetch()}
                />
              </TabsContent>

              <TabsContent value='trends' className='pt-2'>
                <FinanceTrendReport period={period} />
              </TabsContent>

              <TabsContent value='callbacks' className='pt-2'>
                <PaymentCallbackEvents period={period} />
              </TabsContent>

              <TabsContent value='users' className='pt-2'>
                <UserFundsPanel />
              </TabsContent>

              <TabsContent value='alerts' className='pt-2'>
                <FinanceAlertsPanel canOperate={canOperate} />
              </TabsContent>
            </Tabs>
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <AlertDialog
        open={canOperate && confirmTradeNo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTradeNo(null)
            setCompletionReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Complete Order')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Are you sure you want to manually complete this order? The user will be credited with the corresponding quota.'
              )}
            </AlertDialogDescription>
            <div className='space-y-2 pt-2'>
              <Label htmlFor='completion-reason'>
                {t('Completion reason')}
              </Label>
              <Textarea
                id='completion-reason'
                value={completionReason}
                maxLength={500}
                placeholder={t(
                  'Describe the payment evidence or reconciliation reason.'
                )}
                onChange={(event) => setCompletionReason(event.target.value)}
              />
              <p className='text-muted-foreground text-xs'>
                {t('This reason is stored in the financial audit log.')}
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completeMutation.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                completeMutation.isPending || completionReason.trim() === ''
              }
              onClick={() =>
                confirmTradeNo &&
                completeMutation.mutate({
                  tradeNo: confirmTradeNo,
                  reason: completionReason.trim(),
                })
              }
            >
              {completeMutation.isPending ? t('Processing...') : t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
