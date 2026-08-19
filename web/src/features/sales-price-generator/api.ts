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
  SalesPriceGenerationInput,
  SalesPriceGenerationResponse,
  SalesPriceGeneratorFilterParams,
  SupportedChannelModelListResponse,
  SupportedChannelModelListParams,
} from './types'

function requireSuccess<T extends { success: boolean; message?: string }>(
  response: T
): T {
  if (!response.success) {
    throw new Error(response.message || 'Pricing request failed')
  }
  return response
}

export async function getSupportedChannelModels(
  params: SupportedChannelModelListParams
): Promise<SupportedChannelModelListResponse> {
  const response = await api.get(
    '/api/pricing-admin/sales-price-generator/channel-models',
    { params }
  )
  return requireSuccess(response.data)
}

export async function generateSalesPrices(
  input: SalesPriceGenerationInput,
  filters: SalesPriceGeneratorFilterParams
): Promise<SalesPriceGenerationResponse> {
  const response = await api.post(
    '/api/pricing-admin/sales-price-generator/generate',
    input,
    { params: filters }
  )
  return requireSuccess(response.data)
}

export async function exportGeneratedSalesPrices(
  input: SalesPriceGenerationInput,
  filters: SalesPriceGeneratorFilterParams
): Promise<Blob> {
  const response = await api.post(
    '/api/pricing-admin/sales-price-generator/export',
    input,
    { params: filters, responseType: 'blob' }
  )
  return response.data
}
