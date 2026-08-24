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
// ----------------------------------------------------------------------------
// Pricing Types
// ----------------------------------------------------------------------------

export type PricingVendor = {
  id: number
  name: string
  icon?: string
  description?: string
}

export type PricingModel = {
  id?: number
  model_name: string
  description?: string
  icon?: string
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  vendor_description?: string
  enable_groups: string[]
  tags?: string
  supported_endpoint_types?: string[]
  key?: string
  group_ratio?: Record<string, number>
  /** Pricing version returned by backend, useful for cache busting */
  pricing_version?: string
  /** Runtime price source selected by the backend. */
  pricing_source?: string
  /** Current vendor list price normalized by the backend. */
  official_price?: PublicPriceSummary
  /** Current customer-facing sales price per comparable item. */
  lowest_price?: PublicPriceSummary
  /** Current customer-facing sales price per usable group. */
  sales_prices_by_group?: Record<string, PublicPriceSummary>
  /** Usable groups with at least one complete purchase and sales price chain. */
  pricing_groups?: string[]
  /** Whether this model has both a usable route and complete active pricing. */
  available: boolean
  /** Machine-readable reason when the model cannot currently serve traffic. */
  availability_status: 'available' | 'price_unavailable' | 'route_unavailable'
  /**
   * Optional model metadata fields reserved for backend-provided catalog data.
   * Keep them data-driven; do not synthesize display values on the client.
   */
  context_length?: number
  max_output_tokens?: number
  knowledge_cutoff?: string
  release_date?: string
  parameter_count?: string
  input_modalities?: Modality[]
  output_modalities?: Modality[]
  capabilities?: ModelCapability[]
}

export type PublicPriceSummary = {
  currency: string
  billing_mode: string
  price_structure: string
  comparison_scope?: 'component_minimum'
  candidate_count?: number
  items: PublicPriceItem[]
}

export type PublicPriceItem = {
  key: string
  component: string
  amount: string
  base_amount?: string
  unit: string
  unit_size: string
  tier?: string
  upper_bound?: string
  operation?: string
  quality?: string
  resolution?: string
  with_audio?: string
  applied_group?: string
  applied_group_label?: string
}

/** Input/output modalities supported by a model. */
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file'

/** Functional capabilities a model exposes. */
export type ModelCapability =
  | 'function_calling'
  | 'streaming'
  | 'vision'
  | 'json_mode'
  | 'structured_output'
  | 'reasoning'
  | 'tools'
  | 'system_prompt'
  | 'web_search'
  | 'code_interpreter'
  | 'caching'
  | 'embeddings'

export type PricingData = {
  success: boolean
  message?: string
  data: PricingModel[]
  vendors: PricingVendor[]
  group_ratio: Record<string, number>
  usable_group: Record<string, string>
  supported_endpoint: Record<string, string>
  auto_groups: string[]
}

export type TokenUnit = 'M' | 'K'
