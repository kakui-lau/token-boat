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
import { describe, expect, it } from 'vitest'

import { buildModelRoutingFields } from '../lib/model-routing'

describe('model routing payload', () => {
  it('keeps direct model routing and visibility settings', () => {
    const fields = buildModelRoutingFields({
      routing_mode: 'direct',
      visibility: 'public',
      model_purpose: '',
      routing_target_model_id: null,
      sync_official: true,
      name_rule: 2,
      endpoints: '{"openai":"/v1/chat/completions"}',
    })

    expect(fields).toEqual({
      visibility: 'public',
      model_purpose: '',
      routing_target_model_id: null,
      sync_official: 1,
      name_rule: 2,
      endpoints: '{"openai":"/v1/chat/completions"}',
    })
  })

  it('makes a system alias internal and removes duplicate route configuration', () => {
    const fields = buildModelRoutingFields({
      routing_mode: 'alias',
      visibility: 'public',
      model_purpose: 'approval_review',
      routing_target_model_id: 47,
      sync_official: true,
      name_rule: 2,
      endpoints: '{"openai":"/v1/chat/completions"}',
    })

    expect(fields).toEqual({
      visibility: 'internal',
      model_purpose: 'approval_review',
      routing_target_model_id: 47,
      sync_official: 0,
      name_rule: 0,
      endpoints: '',
    })
  })
})
