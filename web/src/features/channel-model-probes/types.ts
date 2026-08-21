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
export type ChannelModelProbeStatus = '' | 'success' | 'failed'

export type ChannelModelProbe = {
  id: number
  channel_id: number
  channel_name: string
  model_name: string
  endpoint_type: string
  success: boolean
  latency_ms: number
  error_code: string
  error_message: string
  probed_at: number
}

export type ChannelModelProbeSummary = {
  total_count: number
  success_count: number
  failed_count: number
  avg_latency_ms: number
  last_probed_at: number
}

export type ChannelModelProbeFilters = {
  keyword: string
  channel_id?: number
  status: ChannelModelProbeStatus
  hours: number
  page: number
  page_size: number
}

export type ChannelModelProbeList = {
  items: ChannelModelProbe[]
  total: number
  page: number
  page_size: number
  hours: number
  summary: ChannelModelProbeSummary
  channels: Array<{ channel_id: number; channel_name: string }>
}

export type ChannelModelProbeResponse = {
  success: boolean
  message?: string
  data: ChannelModelProbeList
}
