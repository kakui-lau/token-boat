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

import type {
  ApiResponse,
  CreateSalesPriceBookInput,
  CreateSalesPriceBookVersionInput,
  PricingChangeBatch,
  PricingChangeBatchItem,
  PricingChangeBatchListFilters,
  PaginatedSalesPriceBookList,
  SalesPriceBook,
  SalesPriceBookItem,
  SalesPriceBookListFilters,
  SalesPriceBookVersion,
  SalesPriceBookVersionDiff,
  UserPriceBookAssignment,
  UserPriceBookAssignmentListFilters,
} from './types'

function requireSuccess<T>(response: ApiResponse<T>): ApiResponse<T> {
  if (!response.success) {
    throw new Error(response.message || 'Pricing request failed')
  }
  return response
}

export async function getSalesPriceBooks(params: SalesPriceBookListFilters) {
  const response = await api.get<
    ApiResponse<PaginatedSalesPriceBookList<SalesPriceBook>>
  >('/api/pricing-admin/price-books', { params })
  return requireSuccess(response.data)
}

export async function createSalesPriceBook(input: CreateSalesPriceBookInput) {
  const response = await api.post<ApiResponse<SalesPriceBook>>(
    '/api/pricing-admin/price-books',
    input
  )
  return requireSuccess(response.data)
}

export async function disableSalesPriceBook(id: number) {
  const response = await api.post<ApiResponse<null>>(
    `/api/pricing-admin/price-books/${id}/disable`
  )
  return requireSuccess(response.data)
}

export async function getSalesPriceBookVersions(priceBookId: number) {
  const response = await api.get<ApiResponse<SalesPriceBookVersion[]>>(
    `/api/pricing-admin/price-books/${priceBookId}/versions`
  )
  return requireSuccess(response.data)
}

export async function createSalesPriceBookVersion(
  priceBookId: number,
  input: CreateSalesPriceBookVersionInput
) {
  const response = await api.post<ApiResponse<SalesPriceBookVersion>>(
    `/api/pricing-admin/price-books/${priceBookId}/versions`,
    input
  )
  return requireSuccess(response.data)
}

export async function cloneSalesPriceBookVersion(
  priceBookId: number,
  sourceVersionId: number
) {
  const response = await api.post<ApiResponse<SalesPriceBookVersion>>(
    `/api/pricing-admin/price-books/${priceBookId}/versions/clone`,
    { source_version_id: sourceVersionId }
  )
  return requireSuccess(response.data)
}

export async function publishSalesPriceBookVersion(versionId: number) {
  const response = await api.post<ApiResponse<null>>(
    `/api/pricing-admin/price-book-versions/${versionId}/publish`
  )
  return requireSuccess(response.data)
}

export async function getSalesPriceBookItems(versionId: number) {
  const response = await api.get<ApiResponse<SalesPriceBookItem[]>>(
    `/api/pricing-admin/price-book-versions/${versionId}/items`
  )
  return requireSuccess(response.data)
}

export async function compareSalesPriceBookVersions(
  baseVersionId: number,
  targetVersionId: number
) {
  const response = await api.get<ApiResponse<SalesPriceBookVersionDiff>>(
    `/api/pricing-admin/price-book-versions/${targetVersionId}/diff`,
    { params: { base_version_id: baseVersionId } }
  )
  return requireSuccess(response.data)
}

export async function generateSalesPriceBookItems(
  versionId: number,
  input: { channel_model_ids: number[]; idempotency_key: string }
) {
  const response = await api.post<
    ApiResponse<{
      batch: PricingChangeBatch
      generated_items: SalesPriceBookItem[]
    }>
  >(`/api/pricing-admin/price-book-versions/${versionId}/generate-items`, input)
  return requireSuccess(response.data)
}

export async function getPricingChangeBatches(
  params: PricingChangeBatchListFilters
) {
  const response = await api.get<
    ApiResponse<PaginatedSalesPriceBookList<PricingChangeBatch>>
  >('/api/pricing-admin/pricing-change-batches', { params })
  return requireSuccess(response.data)
}

export async function getPricingChangeBatch(id: number) {
  const response = await api.get<
    ApiResponse<{ batch: PricingChangeBatch; items: PricingChangeBatchItem[] }>
  >(`/api/pricing-admin/pricing-change-batches/${id}`)
  return requireSuccess(response.data)
}

export async function getUserPriceBookAssignments(
  params: UserPriceBookAssignmentListFilters
) {
  const response = await api.get<
    ApiResponse<PaginatedSalesPriceBookList<UserPriceBookAssignment>>
  >('/api/pricing-admin/user-price-book-assignments', { params })
  return requireSuccess(response.data)
}

export async function exportSalesPriceBookItems(versionId: number) {
  const response = await api.get(
    `/api/pricing-admin/price-book-versions/${versionId}/items/export`,
    { responseType: 'blob' }
  )
  return response.data as Blob
}

export async function assignUserPriceBook(input: {
  user_id: number
  price_book_id: number
  version_policy: 'follow_current' | 'pin_version'
  pinned_version_id?: number
  quote_reference?: string
  contract_reference?: string
  remark?: string
}) {
  const response = await api.post<ApiResponse<UserPriceBookAssignment>>(
    '/api/pricing-admin/user-price-book-assignments',
    input
  )
  return requireSuccess(response.data)
}

export async function cancelUserPriceBookAssignment(id: number) {
  const response = await api.post<ApiResponse<null>>(
    `/api/pricing-admin/user-price-book-assignments/${id}/cancel`
  )
  return requireSuccess(response.data)
}

export async function setDefaultSalesPriceBook(priceBookId: number) {
  const response = await api.put<ApiResponse<null>>(
    '/api/pricing-admin/price-book-defaults',
    { default_key: 'toc_default', price_book_id: priceBookId }
  )
  return requireSuccess(response.data)
}
