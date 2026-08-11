/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type UserModelUsageFilters = {
  start_timestamp: number
  end_timestamp: number
  username?: string
  model_name?: string
  p: number
  page_size: number
}

export type UserModelUsageRow = {
  username: string
  user_id: number
  model_name: string
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  quota: number
  average_use_time: number
}

export type UserModelUsageSummary = {
  user_count: number
  model_count: number
  request_count: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  quota: number
}

export type UserModelUsageData = {
  items: UserModelUsageRow[]
  total: number
  page: number
  page_size: number
  summary: UserModelUsageSummary
}

export type UserModelUsageResponse = {
  success: boolean
  message?: string
  data: UserModelUsageData
}
