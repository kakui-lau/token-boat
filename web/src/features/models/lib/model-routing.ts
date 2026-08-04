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
import type { Model } from '../types'

export interface ModelRoutingFormValues {
  routing_mode: 'direct' | 'alias'
  visibility: 'public' | 'internal'
  model_purpose: string
  routing_target_model_id?: number | null
  sync_official: boolean
  name_rule: number
  endpoints: string
}

export type ModelRoutingFields = Pick<
  Model,
  | 'visibility'
  | 'model_purpose'
  | 'routing_target_model_id'
  | 'sync_official'
  | 'name_rule'
  | 'endpoints'
>

export function buildModelRoutingFields(
  values: ModelRoutingFormValues
): ModelRoutingFields {
  if (values.routing_mode === 'alias') {
    return {
      visibility: 'internal',
      model_purpose: values.model_purpose || 'approval_review',
      routing_target_model_id: values.routing_target_model_id,
      sync_official: 0,
      name_rule: 0,
      endpoints: '',
    }
  }

  return {
    visibility: values.visibility,
    model_purpose: '',
    routing_target_model_id: null,
    sync_official: values.sync_official ? 1 : 0,
    name_rule: values.name_rule,
    endpoints: values.endpoints,
  }
}
