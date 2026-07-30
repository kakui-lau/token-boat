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
  ActivePriceBundle,
  ChannelCircuitOverview,
  ChannelModel,
  ChannelModelListResponse,
  FlatTokenPrices,
  ImportResponse,
  ModelPriceOverview,
  OfficialPriceOverview,
  OfficialPriceVersion,
  PriceSimulationResult,
  PricingRuntimeStatus,
  PricingReconciliationSummary,
  PricingCatalogOptionsResponse,
  PriceVersionResponse,
  PublishLatestOfficialPriceDraftsResponse,
  PurchasePriceVersion,
  RetailPriceVersion,
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

export async function resetPricingCircuit(
  channelId: number
): Promise<PriceVersionResponse<{ channel_id: number; reset: boolean }>> {
  const response = await api.post(
    `/api/pricing-admin/circuit-overview/${channelId}/reset`
  )
  return requirePricingSuccess(response.data)
}

export async function setPricingModelRuntime(input: {
  model_name: string
  runtime_mode: 'legacy' | 'v2'
}): Promise<
  PriceVersionResponse<{
    model_name: string
    runtime_mode: 'legacy' | 'v2'
    updated: number
  }>
> {
  const response = await api.put('/api/pricing-admin/model-runtime', input)
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
  runtime_mode?: 'legacy' | 'v2'
  retail_status?: 'published' | 'unpublished'
  page?: number
  page_size?: number
}): Promise<ChannelModelListResponse> {
  const response = await api.get('/api/pricing-admin/channel-models', {
    params,
  })
  return response.data
}

export async function getRequestPricingSnapshots(params: {
  status?: 'reserved' | 'pending' | 'settled' | 'refunded'
  reconciliation?: boolean
  billing_mode?: string
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

export async function syncLegacyChannelModels(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/sync-legacy'
  )
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

export async function getModelPriceOverview(
  keyword?: string
): Promise<PriceVersionResponse<ModelPriceOverview[]>> {
  const response = await api.get('/api/pricing-admin/model-price-overview', {
    params: { keyword },
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

export async function importLegacyOfficialPrices(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/official-prices/import-legacy'
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
  contract_reference: string
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

export async function getRetailPriceVersions(
  channelModelId: number
): Promise<PriceVersionResponse<RetailPriceVersion[]>> {
  const response = await api.get('/api/pricing-admin/retail-prices', {
    params: { channel_model_id: channelModelId },
  })
  return response.data
}

export async function getActivePriceBundle(
  channelModelId: number
): Promise<PriceVersionResponse<ActivePriceBundle>> {
  const response = await api.get('/api/pricing-admin/active-price-bundle', {
    params: { channel_model_id: channelModelId },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
  return requirePricingSuccess(response.data)
}

export type RetailDraftPayload = {
  channel_model_id: number
  purchase_price_version_id: number
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  minimum_margin_rate: string
  remark: string
  expected_updated_at?: number
}

export async function createRetailDraft(
  input: RetailDraftPayload
): Promise<PriceVersionResponse<RetailPriceVersion>> {
  const response = await api.post('/api/pricing-admin/drafts/retail', input)
  return requirePricingSuccess(response.data)
}

export async function updateRetailDraft(
  id: number,
  input: RetailDraftPayload
): Promise<PriceVersionResponse<RetailPriceVersion>> {
  const response = await api.put(
    `/api/pricing-admin/drafts/retail/${id}`,
    input
  )
  return requirePricingSuccess(response.data)
}

export async function publishPriceVersion(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/publish`
  )
  return requirePricingSuccess(response.data)
}

export async function suspendPriceVersion(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/suspend`
  )
  return requirePricingSuccess(response.data)
}

export async function deletePriceDraft(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.delete(`/api/pricing-admin/${kind}-prices/${id}`)
  return requirePricingSuccess(response.data)
}

export async function simulatePrice(input: {
  channel_model_id: number
  purchase_price_version_id: number
  retail_price_version_id: number
  prompt_tokens: number
  completion_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  image_input_tokens: number
  image_output_tokens: number
  audio_input_tokens: number
  audio_output_tokens: number
  request_count: number
  image_count: number
  audio_seconds: number
  video_seconds: number
  character_count: number
  request_body: string
}): Promise<PriceVersionResponse<PriceSimulationResult>> {
  const response = await api.post('/api/pricing-admin/simulate', input)
  return requirePricingSuccess(response.data)
}
