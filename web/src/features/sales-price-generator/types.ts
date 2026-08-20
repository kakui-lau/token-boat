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

export type SalesPriceModelRateInput = {
  model_id: number
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  /**
   * VCR 的三个分量（百分比数字，如 "4" 表示 4%），用于导出 CSV 分列显示。
   * 可选字段：当某行从未被编辑且没有行费率记录时省略。
   */
  payment_processing_fee_rate?: string
  distribution_fee_rate?: string
  operations_labor_cost_rate?: string
}

/**
 * Per-row editable rate values (percentages) used by the generated price
 * table. The VCR is split into its three components so users can edit each
 * one individually — the combined VCR is derived on the fly.
 */
export type RowRateValues = {
  payment_processing_fee_rate: string
  distribution_fee_rate: string
  operations_labor_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
}

export type SalesPriceGenerationInput = {
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  channel_model_ids?: number[]
  model_rates?: SalesPriceModelRateInput[]
}

export type SalesPriceGeneratorFilterParams = {
  keyword?: string
  channel_id?: number
  status?: number
  routing_status?: 'available' | 'removed'
  runtime_mode?: 'legacy' | 'v2'
  retail_status?: 'published' | 'unpublished'
}

export type SupportedChannelModelListParams =
  SalesPriceGeneratorFilterParams & {
    page: number
    page_size: number
  }

export type SupportedChannelModel = {
  channel_model_id: number
  model_id: number
  model_name: string
  channel_name: string
  upstream_model_name: string
  runtime_mode: 'legacy' | 'v2'
  purchase_pricing_mode: string
  purchase_discount: string
}

export type SupportedChannelModelListResponse = {
  success: boolean
  message?: string
  data: {
    items: SupportedChannelModel[]
    total: number
    page: number
    page_size: number
  }
}

export type GeneratedSalesPriceChannel = {
  channel_model_id: number
  channel_name: string
  purchase_discount: string
  retail_discount: string
}

export type GeneratedSalesPriceRow = {
  model_id: number
  model_name: string
  effective_rate_details: string
  minimum_retail_discount: string
  minimum_purchase_discount: string
  channels: GeneratedSalesPriceChannel[]
}

export type SalesPriceGenerationResponse = {
  success: boolean
  message?: string
  data: {
    rates: SalesPriceGenerationInput
    items: GeneratedSalesPriceRow[]
    maximum_channel_count: number
  }
}
