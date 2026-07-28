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
  ChannelModel,
  ChannelModelListResponse,
  FlatTokenPrices,
  ImportResponse,
  ModelPriceOverview,
  OfficialPriceOverview,
  OfficialPriceVersion,
  PriceSimulationResult,
  PricingCatalogOptionsResponse,
  PriceVersionResponse,
  PublishLatestOfficialPriceDraftsResponse,
  PurchasePriceVersion,
  RetailPriceVersion,
} from './types'

export async function getChannelModels(params: {
  keyword?: string
  page?: number
  page_size?: number
}): Promise<ChannelModelListResponse> {
  const response = await api.get('/api/pricing-admin/channel-models', {
    params,
  })
  return response.data
}

export async function syncLegacyChannelModels(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/channel-models/sync-legacy'
  )
  return response.data
}

export async function getPricingCatalogOptions(): Promise<PricingCatalogOptionsResponse> {
  const response = await api.get('/api/pricing-admin/catalog-options')
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
  return response.data
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
  return response.data
}

export async function importLegacyOfficialPrices(): Promise<ImportResponse> {
  const response = await api.post(
    '/api/pricing-admin/official-prices/import-legacy'
  )
  return response.data
}

export async function publishLatestOfficialPriceDrafts(): Promise<PublishLatestOfficialPriceDraftsResponse> {
  const response = await api.post(
    '/api/pricing-admin/official-prices/publish-latest'
  )
  return response.data
}

export async function getOfficialPriceVersions(
  modelId: number
): Promise<PriceVersionResponse<OfficialPriceVersion[]>> {
  const response = await api.get('/api/pricing-admin/official-prices', {
    params: { model_id: modelId },
  })
  return response.data
}

export async function getOfficialPriceOverview(
  keyword?: string
): Promise<PriceVersionResponse<OfficialPriceOverview[]>> {
  const response = await api.get('/api/pricing-admin/official-price-overview', {
    params: { keyword },
  })
  return response.data
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
  return response.data
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
  return response.data
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
  return response.data
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
  return response.data
}

export async function getPurchasePriceVersions(
  channelModelId: number
): Promise<PriceVersionResponse<PurchasePriceVersion[]>> {
  const response = await api.get('/api/pricing-admin/purchase-prices', {
    params: { channel_model_id: channelModelId },
  })
  return response.data
}

export async function createPurchaseDraft(input: {
  channel_model_id: number
  official_price_version_id?: number
  pricing_mode: 'official_ratio' | 'component_ratio' | 'fixed_unit_price'
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
}): Promise<PriceVersionResponse<PurchasePriceVersion>> {
  const response = await api.post('/api/pricing-admin/drafts/purchase', input)
  return response.data
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
  })
  return response.data
}

export async function createRetailDraft(input: {
  channel_model_id: number
  purchase_price_version_id: number
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  minimum_margin_rate: string
  remark: string
}): Promise<PriceVersionResponse<RetailPriceVersion>> {
  const response = await api.post('/api/pricing-admin/drafts/retail', input)
  return response.data
}

export async function publishPriceVersion(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/publish`
  )
  return response.data
}

export async function suspendPriceVersion(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.post(
    `/api/pricing-admin/${kind}-prices/${id}/suspend`
  )
  return response.data
}

export async function deletePriceDraft(
  kind: 'official' | 'purchase' | 'retail',
  id: number
): Promise<PriceVersionResponse<null>> {
  const response = await api.delete(`/api/pricing-admin/${kind}-prices/${id}`)
  return response.data
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
}): Promise<PriceVersionResponse<PriceSimulationResult>> {
  const response = await api.post('/api/pricing-admin/simulate', input)
  return response.data
}
