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
export type SalesPriceBookAudience = 'toc' | 'tob' | 'internal'
export type SalesPriceBookStatus = 'draft' | 'enabled' | 'disabled' | 'archived'
export type SalesPriceBookVersionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'superseded'
  | 'cancelled'

export type SalesPriceBookVersion = {
  id: number
  price_book_id: number
  version: number
  status: SalesPriceBookVersionStatus
  cost_basis_strategy: string
  payment_fee_rate: string
  distribution_fee_rate: string
  operations_labor_rate: string
  total_variable_cost_rate: string
  effective_tax_rate: string
  target_net_margin: string
  minimum_margin_rate: string
  content_hash: string
  created_at: number
  published_at: number
  remark: string
}

export type SalesPriceBook = {
  id: number
  code: string
  name: string
  audience: SalesPriceBookAudience
  currency: string
  status: SalesPriceBookStatus
  current_version_id?: number
  current_version?: SalesPriceBookVersion
  model_count: number
  assigned_users: number
  missing_model_count: number
  remark: string
}

export type SalesPriceBookItem = {
  id: number
  price_book_version_id: number
  model_id: number
  model_name: string
  status: 'enabled' | 'disabled' | 'review_required'
  billing_mode: string
  price_structure: string
  price_components: string
  sales_billing_expr: string
  sales_expr_hash: string
  expression_source: string
  expression_schema_version: string
  pricing_method: string
  official_price_version_id?: number
  primary_purchase_version_id?: number
  selling_factor: string
  official_discount: string
  minimum_margin_override: string
  currency: string
  generated_by_batch_id?: number
  remark: string
}

export type UserPriceBookAssignment = {
  id: number
  user_id: number
  price_book_id: number
  version_policy: 'follow_current' | 'pin_version'
  pinned_version_id?: number
  status: 'scheduled' | 'active' | 'expired' | 'cancelled'
  effective_from: number
  effective_to: number
  quote_reference: string
  contract_reference: string
  remark: string
  username: string
  price_book_name: string
  price_book_code: string
}

export type PaginatedSalesPriceBookList<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}

export type SalesPriceBookListFilters = {
  keyword?: string
  audience?: SalesPriceBookAudience
  status?: SalesPriceBookStatus
  p: number
  page_size: number
}

export type UserPriceBookAssignmentListFilters = {
  keyword?: string
  user_id?: number
  price_book_id?: number
  status?: UserPriceBookAssignment['status']
  p: number
  page_size: number
}

export type PricingChangeBatch = {
  id: number
  batch_no: string
  trigger_type: string
  trigger_id?: number
  status: 'completed' | 'review_required'
  total_count: number
  changed_count: number
  unchanged_count: number
  review_count: number
  failed_count: number
  requested_by: number
  requested_by_username: string
  created_at: number
  error_message: string
}

export type PricingChangeBatchPublishResult = {
  purchase_versions_published: number
  sales_versions_published: number
  review_required: number
}

export type PricingAutomationReconciliationSummary = {
  official_versions_checked: number
  official_gaps_repaired: number
  purchase_versions_checked: number
  purchase_gaps_repaired: number
}

export type PricingChangeBatchItem = {
  id: number
  batch_id: number
  target_type: 'sales_price_book_item' | 'purchase_price_version'
  target_id?: number
  model_id: number
  model_name: string
  channel_model_id?: number
  channel_name: string
  price_book_id?: number
  price_book_name: string
  action: string
  old_version_id?: number
  new_version_id?: number
  old_reference_cost: string
  new_reference_cost: string
  old_reference_price: string
  new_reference_price: string
  margin_before: string
  margin_after: string
  risk_code: string
  status: string
  diff_detail: string
  error_message: string
}

export type PricingChangeBatchListFilters = {
  keyword?: string
  status?: PricingChangeBatch['status']
  trigger_type?: string
  p: number
  page_size: number
}

export type SalesPriceBookPolicyChange = {
  field: string
  old_value: string
  new_value: string
}

export type SalesPriceBookChannelMargin = {
  channel_model_id: number
  channel_name: string
  purchase_price_version_id: number
  reference_cost: string
  margin_rate: string
  meets_minimum_margin: boolean
}

export type SalesPriceBookItemDiff = {
  model_id: number
  model_name: string
  change_type: 'added' | 'changed' | 'removed' | 'unchanged'
  old_item?: SalesPriceBookItem
  new_item?: SalesPriceBookItem
  old_reference_cost: string
  new_reference_cost: string
  old_reference_price: string
  new_reference_price: string
  price_change_rate: string
  margin_before: string
  margin_after: string
  old_purchase_version_ids: number[]
  new_purchase_version_ids: number[]
  risk_codes: string[]
  old_channel_margins: SalesPriceBookChannelMargin[]
  new_channel_margins: SalesPriceBookChannelMargin[]
}

export type SalesPriceBookVersionDiff = {
  base_version: SalesPriceBookVersion
  target_version: SalesPriceBookVersion
  policy_changes: SalesPriceBookPolicyChange[]
  items: SalesPriceBookItemDiff[]
  added_count: number
  changed_count: number
  removed_count: number
  unchanged_count: number
  review_count: number
}

export type ApiResponse<T> = {
  success: boolean
  message?: string
  data: T
}

export type CreateSalesPriceBookInput = Pick<
  SalesPriceBook,
  'code' | 'name' | 'audience' | 'currency' | 'remark'
>

export type CreateSalesPriceBookVersionInput = Pick<
  SalesPriceBookVersion,
  | 'cost_basis_strategy'
  | 'payment_fee_rate'
  | 'distribution_fee_rate'
  | 'operations_labor_rate'
  | 'total_variable_cost_rate'
  | 'effective_tax_rate'
  | 'target_net_margin'
  | 'minimum_margin_rate'
  | 'remark'
>
