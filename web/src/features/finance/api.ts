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
import { api } from '@/lib/api'

import { getFinancePeriodRange } from './lib'
import type {
  FinanceApiResponse,
  FinanceOrderFilters,
  FinanceOrderPage,
  FinanceOverview,
  FinancePeriod,
  FinanceAlert,
  FinanceAlertFilters,
  FinanceAlertScanResult,
  FinanceAlertSummary,
  FinancePage,
  FinanceTrendReport,
  FinanceUserDetail,
  FinanceUserListItem,
  PaymentCallbackEvent,
  PaymentCallbackFilters,
  PaymentCallbackSummary,
} from './types'

export async function getFinanceOverview(
  period: FinancePeriod
): Promise<FinanceApiResponse<FinanceOverview>> {
  const response = await api.get('/api/user/topup/summary', {
    params: getFinancePeriodRange(period),
  })
  return response.data
}

function financeOrderParams(filters: FinanceOrderFilters) {
  const range = getFinancePeriodRange(filters.period)
  const keyword = filters.keyword?.trim().replaceAll('%', '')
  return {
    ...range,
    keyword: keyword ? `%${keyword}%` : undefined,
    status: filters.status,
    provider: filters.provider,
    order_type: filters.orderType,
  }
}

export async function getFinanceOrders(
  filters: FinanceOrderFilters,
  page: number,
  pageSize: number
): Promise<FinanceApiResponse<FinanceOrderPage>> {
  const response = await api.get('/api/user/topup', {
    params: {
      ...financeOrderParams(filters),
      p: page,
      page_size: pageSize,
    },
  })
  return response.data
}

export async function exportFinanceOrders(
  filters: FinanceOrderFilters
): Promise<Blob> {
  const response = await api.get('/api/user/topup/export', {
    params: financeOrderParams(filters),
    responseType: 'blob',
  })
  return response.data
}

export async function getFinanceTrend(
  period: FinancePeriod
): Promise<FinanceApiResponse<FinanceTrendReport>> {
  const response = await api.get('/api/user/topup/trend', {
    params: getFinancePeriodRange(period),
  })
  return response.data
}

export async function getPaymentCallbackEvents(
  filters: PaymentCallbackFilters,
  page: number,
  pageSize: number
): Promise<FinanceApiResponse<FinancePage<PaymentCallbackEvent>>> {
  const response = await api.get('/api/user/finance/callback-events', {
    params: {
      ...getFinancePeriodRange(filters.period),
      provider: filters.provider,
      status: filters.status,
      keyword: filters.keyword,
      p: page,
      page_size: pageSize,
    },
  })
  return response.data
}

export async function getPaymentCallbackSummary(
  period: FinancePeriod
): Promise<FinanceApiResponse<PaymentCallbackSummary>> {
  const response = await api.get('/api/user/finance/callback-events/summary', {
    params: getFinancePeriodRange(period),
  })
  return response.data
}

export async function getFinanceUsers(
  keyword: string,
  page: number,
  pageSize: number
): Promise<FinanceApiResponse<FinancePage<FinanceUserListItem>>> {
  const response = await api.get('/api/user/finance/users', {
    params: { keyword: keyword || undefined, p: page, page_size: pageSize },
  })
  return response.data
}

export async function getFinanceUserDetail(
  userId: number
): Promise<FinanceApiResponse<FinanceUserDetail>> {
  const response = await api.get(`/api/user/finance/users/${userId}`)
  return response.data
}

export async function getFinanceAlerts(
  filters: FinanceAlertFilters,
  page: number,
  pageSize: number
): Promise<FinanceApiResponse<FinancePage<FinanceAlert>>> {
  const response = await api.get('/api/user/finance/alerts', {
    params: { ...filters, p: page, page_size: pageSize },
  })
  return response.data
}

export async function getFinanceAlertSummary(): Promise<
  FinanceApiResponse<FinanceAlertSummary>
> {
  const response = await api.get('/api/user/finance/alerts/summary')
  return response.data
}

export async function scanFinanceAlerts(): Promise<
  FinanceApiResponse<FinanceAlertScanResult>
> {
  const response = await api.post('/api/user/finance/alerts/scan')
  return response.data
}

export async function acknowledgeFinanceAlert(
  alertId: number
): Promise<FinanceApiResponse<FinanceAlert>> {
  const response = await api.post(
    `/api/user/finance/alerts/${alertId}/acknowledge`,
    {}
  )
  return response.data
}

export async function resolveFinanceAlert(
  alertId: number,
  note: string
): Promise<FinanceApiResponse<FinanceAlert>> {
  const response = await api.post(
    `/api/user/finance/alerts/${alertId}/resolve`,
    { note }
  )
  return response.data
}
