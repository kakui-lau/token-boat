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
import { beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { getChannelModelProbes } from '../api'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(api.get).mockReset()
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { items: [] } },
  })
})

test('loads channel-model probe history with all panel filters', async () => {
  await getChannelModelProbes({
    keyword: 'gpt',
    channel_id: 12,
    status: 'failed',
    hours: 72,
    page: 2,
    page_size: 200,
  })

  expect(api.get).toHaveBeenCalledWith('/api/channel/model-probes', {
    params: {
      keyword: 'gpt',
      channel_id: 12,
      status: 'failed',
      hours: 72,
      p: 2,
      page_size: 200,
    },
  })
})
