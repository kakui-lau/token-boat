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
  ChannelCircuitOverview,
  ChannelCircuitEventListResponse,
  ChannelModel,
  AutomatedPriceDraftResult,
  ChannelModelListResponse,
  FlatTokenPrices,
  ImportResponse,
  OfficialPriceOverview,
  OfficialPriceVersion,
  PricingRuntimeStatus,
  PricingFinancialSummary,
  PricingReconciliationSummary,
  PricingCatalogOptionsResponse,
  PriceVersionResponse,
  PublishLatestOfficialPriceDraftsResponse,
  PurchasePriceVersion,
  PurchasePriceSuspendImpact,
  RequestPricingSnapshotListResponse,
} from './types'

export async function getPricingRuntimeStatus(): Promise<
  PriceVersionResponse<PricingRuntimeStatus>
> {
  const response = await api.get('/api/pricing-admin/runtime-status')
  return requirePricingSuccess(response.data)
}

export async function getPricingCircuitOverview(): Promise<
  PriceVersionResponse<ChannelCircuitOverview>
> {
  const response = await api.get('/api/pricing-admin/circuit-overview')
  return requirePricingSuccess(response.data)
}

export async function getPricingCircuitEvents(params: {
  channel_id?: number
  event?: string
  page?: number
  page_size?: number
}): Promise<ChannelCircuitEventListResponse> {
  const response = await api.get('/api/pricing-admin/circuit-events', {
    params,
  })
  return requirePricingSuccess(response.data)
}

export async function resetPricingCircuit(
  channelId: number,
  modelId?: number
): Promise<
  PriceVersionResponse<{ channel_id: number; model_id: number; reset: boolean }>
> {
  const response = await api.post(
    `/api/pricing-admin/circuit-overview/${channelId}/reset`,
    undefined,
    { params: modelId ? { model_id: modelId } : undefined }
  )
  return requirePricingSuccess(response.data)
}

function requirePricingSuccess<
  T extends { success: boolean; message?: string },
>(response: T): T {
  if (!response.success) {
    throw new Error(response.message || 'Pricing request failed')
  }
  return response
}

export async function getChannelModels(params: {
  keyword?: string
  channel_id?: number
  status?: number
  routing_status?: 'available' | 'removed'
  purchase_status?: 'published' | 'unpublished'
  page?: number
  page_size?: number
}): Promise<ChannelModelListResponse> {
  const response = await api.get('/api/pricing-admin/channel-models', {
    params,
  })
  return response.data
}

export async function getChannelModelIds(params: {
  keyword?: string
  channel_id?: number
  status?: number
  routing_status?: 'available' | 'removed'
  purchase_status?: 'published' | 'unpublished'
}): Promise<{
  success: boolean
  message?: string
  data: Array<{
    id: number
    model_id: number
    model_name: string
    channel_name: string
  }>
}> {
  const response = await api.get('/api/pricing-admin/channel-models/ids', {
    params,
  })
  return requirePricingSuccess(response.data)
}

export async function exportChannelModelPrices(params: {
  keyword?: string
  channel_id?: number
  status?: number
  routing_status?: 'available' | 'removed'
  purchase_status?: 'published' | 'unpublished'
}): Promise<Blob> {
  const response = await api.get('/api/pricing-admin/channel-models/export', {
    params,
    responseType: 'blob',
  })
  return response.data
}

export async function exportSelectedChannelModelPrices(
  channelModelIds: number[]
): Promise<Blob> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/export-selected',
    { channel_model_ids: channelModelIds },
    { responseType: 'blob' }
  )
  return response.data
}

export async function exportSelectedPurchaseDiscounts(
  channelModelIds: number[]
): Promise<Blob> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/export-selected-purchase-discounts',
    { channel_model_ids: channelModelIds },
    { responseType: 'blob' }
  )
  return response.data
}

export async function deleteSelectedChannelModels(
  channelModelIds: number[]
): Promise<PriceVersionResponse<{ deleted: number }>> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/delete-selected',
    { channel_model_ids: channelModelIds }
  )
  return requirePricingSuccess(response.data)
}

export async function getRequestPricingSnapshots(params: {
  status?: 'reserved' | 'pending' | 'settled' | 'refunded' | 'archived'
  reconciliation?: boolean
  billing_mode?: string
  created_from?: number
  created_to?: number
  keyword?: string
  page?: number
  page_size?: number
}): Promise<RequestPricingSnapshotListResponse> {
  const response = await api.get(
    '/api/pricing-admin/request-pricing-snapshots',
    { params }
  )
  return requirePricingSuccess(response.data)
}

export async function getPricingReconciliationSummary(): Promise<
  PriceVersionResponse<PricingReconciliationSummary>
> {
  const response = await api.get(
    '/api/pricing-admin/request-pricing-snapshots/summary'
  )
  return requirePricingSuccess(response.data)
}

export async function getPricingFinancialSummary(params?: {
  created_from?: number
  created_to?: number
}): Promise<PriceVersionResponse<PricingFinancialSummary>> {
  const response = await api.get(
    '/api/pricing-admin/request-pricing-snapshots/financial-summary',
    { params }
  )
  return requirePricingSuccess(response.data)
}

export async function confirmPricingSnapshotRefunded(
  id: number
): Promise<PriceVersionResponse<{ id: number; status: 'refunded' }>> {
  const response = await api.post(
    `/api/pricing-admin/request-pricing-snapshots/${id}/confirm-refunded`
  )
  return requirePricingSuccess(response.data)
}

export async function recordPricingSnapshotProviderCost(
  id: number,
  input: {
    cost: string
    scope: 'full_provider_cost' | 'platform_fee_only'
  }
): Promise<
  PriceVersionResponse<{
    id: number
    provider_reported_cost: string
    scope: 'full_provider_cost' | 'platform_fee_only'
  }>
> {
  const response = await api.post(
    `/api/pricing-admin/request-pricing-snapshots/${id}/provider-cost`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function syncChannelModels(): Promise<ImportResponse> {
  const response = await api.post('/api/pricing-admin/channel-models/sync')
  return requirePricingSuccess(response.data)
}

export async function getPricingCatalogOptions(
  channelId?: number
): Promise<PricingCatalogOptionsResponse> {
  const response = await api.get('/api/pricing-admin/catalog-options', {
    params: channelId ? { channel_id: channelId } : undefined,
  })
  return response.data
}

export async function createChannelModel(input: {
  channel_id: number
  model_id: number
  upstream_model_name: string
  status: number
  priority: number
  weight: number
  region: string
}): Promise<PriceVersionResponse<ChannelModel>> {
  const response = await api.post('/api/pricing-admin/channel-models', input)
  return requirePricingSuccess(response.data)
}

export async function updateChannelModel(
  id: number,
  input: {
    channel_id: number
    model_id: number
    upstream_model_name: string
    status: number
    priority: number
    weight: number
    region: string
  }
): Promise<PriceVersionResponse<ChannelModel>> {
  const response = await api.put(
    `/api/pricing-admin/channel-models/${id}`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function publishLatestOfficialPriceDrafts(): Promise<PublishLatestOfficialPriceDraftsResponse> {
  const response = await api.post(
    '/api/pricing-admin/official-prices/publish-latest'
  )
  return requirePricingSuccess(response.data)
}

export async function getOfficialPriceVersions(
  modelId: number
): Promise<PriceVersionResponse<OfficialPriceVersion[]>> {
  const response = await api.get('/api/pricing-admin/official-prices', {
    params: { model_id: modelId },
  })
  return requirePricingSuccess(response.data)
}

export async function getOfficialPriceOverview(
  keyword?: string
): Promise<PriceVersionResponse<OfficialPriceOverview[]>> {
  const response = await api.get('/api/pricing-admin/official-price-overview', {
    params: { keyword },
  })
  return requirePricingSuccess(response.data)
}

export async function createOfficialPriceDraft(
  input: Omit<
    OfficialPriceVersion,
    | 'id'
    | 'version'
    | 'status'
    | 'effective_from'
    | 'effective_to'
    | 'created_at'
    | 'updated_at'
  >
): Promise<PriceVersionResponse<OfficialPriceVersion>> {
  const response = await api.post('/api/pricing-admin/official-prices', input)
  return requirePricingSuccess(response.data)
}

export async function updateOfficialPriceDraft(
  id: number,
  input: Omit<
    OfficialPriceVersion,
    | 'id'
    | 'version'
    | 'status'
    | 'effective_from'
    | 'effective_to'
    | 'created_at'
    | 'updated_at'
  >
): Promise<PriceVersionResponse<OfficialPriceVersion>> {
  const response = await api.put(
    `/api/pricing-admin/official-prices/${id}`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function createOfficialFlatDraft(input: {
  model_id: number
  currency: string
  prices: FlatTokenPrices
  source_url: string
  source_version: string
  source_updated_at: number
  region: string
  remark: string
}): Promise<PriceVersionResponse<OfficialPriceVersion>> {
  const response = await api.post(
    '/api/pricing-admin/drafts/official-flat',
    input
  )
  return requirePricingSuccess(response.data)
}

export async function updateOfficialFlatDraft(
  id: number,
  input: {
    model_id: number
    currency: string
    prices: FlatTokenPrices
    source_url: string
    source_version: string
    source_updated_at: number
    region: string
    remark: string
  }
): Promise<PriceVersionResponse<OfficialPriceVersion>> {
  const response = await api.put(
    `/api/pricing-admin/drafts/official-flat/${id}`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function getPurchasePriceVersions(
  channelModelId: number
): Promise<PriceVersionResponse<PurchasePriceVersion[]>> {
  const response = await api.get('/api/pricing-admin/purchase-prices', {
    params: { channel_model_id: channelModelId },
  })
  return response.data
}

export type PurchaseDraftPayload = {
  channel_model_id: number
  official_price_version_id?: number
  pricing_mode: 'official_ratio' | 'component_ratio' | 'fixed_unit_price'
  currency: string
  purchase_discount: string
  input_discount: string
  output_discount: string
  cache_read_discount: string
  cache_write_discount: string
  image_input_discount: string
  image_output_discount: string
  audio_input_discount: string
  audio_output_discount: string
  prices: FlatTokenPrices
  quote_reference: string
  quote_valid_until: number
  contract_reference: string
  contract_effective_from: number
  contract_effective_to: number
  remark: string
  expected_updated_at?: number
}

export async function createPurchaseDraft(
  input: PurchaseDraftPayload
): Promise<PriceVersionResponse<PurchasePriceVersion>> {
  const response = await api.post('/api/pricing-admin/drafts/purchase', input)
  return requirePricingSuccess(response.data)
}

export async function updatePurchaseDraft(
  id: number,
  input: PurchaseDraftPayload
): Promise<PriceVersionResponse<PurchasePriceVersion>> {
  const response = await api.put(
    `/api/pricing-admin/drafts/purchase/${id}`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function publishPriceVersion(
  kind: 'official' | 'purchase',
  id: number
): Promise<PriceVersionResponse<AutomatedPriceDraftResult[]>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/publish`
  )
  return requirePricingSuccess(response.data)
}

export async function suspendPriceVersion(
  kind: 'official' | 'purchase',
  id: number,
  force = false
): Promise<PriceVersionResponse<null>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/suspend`,
    { force }
  )
  return requirePricingSuccess(response.data)
}

export async function getPurchasePriceSuspendImpact(
  id: number
): Promise<PriceVersionResponse<PurchasePriceSuspendImpact>> {
  const response = await api.get(
    `/api/pricing-admin/purchase-prices/${id}/suspend-impact`
  )
  return requirePricingSuccess(response.data)
}

export async function deletePriceDraft(
  kind: 'official' | 'purchase',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.delete(`/api/pricing-admin/${kind}-prices/${id}`)
  return requirePricingSuccess(response.data)
}
