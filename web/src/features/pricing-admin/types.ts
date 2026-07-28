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
export type ChannelModel = {
  id: number
  channel_id: number
  channel_name: string
  model_id: number
  model_name: string
  upstream_model_name: string
  status: number
  priority: number
  weight: number
  region: string
  runtime_mode: 'legacy' | 'v2'
}

export type ChannelModelListResponse = {
  success: boolean
  message?: string
  data: {
    items: ChannelModel[]
    total: number
    page: number
    page_size: number
  }
}

export type ImportResult = {
  created: number
  updated?: number
  skipped_existing?: number
  skipped_unknown?: number
  skipped_unpriced?: number
}

export type ImportResponse = {
  success: boolean
  message?: string
  data: ImportResult
}

export type PriceVersionStatus = 'draft' | 'active' | 'suspended' | 'expired'

export type OfficialPriceVersion = {
  id: number
  model_id: number
  billing_mode: string
  price_structure: string
  price_components: string
  billing_expr: string
  currency: string
  version: number
  status: PriceVersionStatus
  source: string
  effective_from: number
  effective_to: number
}

export type PurchasePriceVersion = {
  id: number
  channel_model_id: number
  official_price_version_id?: number
  pricing_mode: string
  billing_mode: string
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  currency: string
  version: number
  status: PriceVersionStatus
  purchase_discount: string
  purchase_billing_expr: string
}

export type RetailPriceVersion = {
  id: number
  channel_model_id: number
  purchase_price_version_id: number
  billing_mode: string
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  currency: string
  version: number
  status: PriceVersionStatus
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  minimum_margin_rate: string
  retail_billing_expr: string
}

export type PriceVersionResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type FlatTokenPrices = {
  input_unit_price: string
  output_unit_price: string
  cache_read_unit_price: string
  cache_write_unit_price: string
  image_input_unit_price: string
  image_output_unit_price: string
  audio_input_unit_price: string
  audio_output_unit_price: string
}

export type PriceSimulationResult = {
  purchase_cost: string
  retail_amount: string
  variable_cost: string
  pre_tax_profit: string
  tax_expense: string
  net_profit: string
  gross_margin_rate: string
  net_margin_rate: string
  minimum_margin_rate: string
  meets_minimum_margin: boolean
  currency: string
}

export type PricingCatalogOption = {
  id: number
  name: string
}

export type PricingCatalogOptionsResponse = {
  success: boolean
  data: {
    channels: PricingCatalogOption[]
    models: PricingCatalogOption[]
  }
}
