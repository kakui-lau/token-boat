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
