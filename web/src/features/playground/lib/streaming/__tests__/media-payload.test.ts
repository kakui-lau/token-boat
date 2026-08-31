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

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import type { Message } from '../../../types'
import {
  buildChatCompletionPayload,
  isImageGenerationModel,
  isVideoGenerationModel,
  supportsGeneratedAudio,
} from '../payload-builder'

const messages: Message[] = [
  {
    key: 'user-1',
    from: 'user',
    versions: [{ id: 'v1', content: 'draw a boat' }],
  },
]

describe('playground media payload', () => {
  it('forces image generation requests to non-streaming multimodal output', () => {
    const payload = buildChatCompletionPayload(
      messages,
      {
        ...DEFAULT_CONFIG,
        model: 'google/gemini-3-pro-image-preview',
        stream: true,
      },
      DEFAULT_PARAMETER_ENABLED
    )

    expect(payload.stream).toBe(false)
    expect(payload.modalities).toEqual(['text', 'image'])
  })

  it('classifies supported image and video model families', () => {
    expect(isImageGenerationModel('google/gemini-2.5-flash-image')).toBe(true)
    expect(isVideoGenerationModel('bytedance/seedance-2.0')).toBe(true)
    expect(isVideoGenerationModel('openai/gpt-5.4')).toBe(false)
  })

  it('does not request generated audio from Seedance 2.5', () => {
    expect(supportsGeneratedAudio('bytedance/seedance-2.5-upscale')).toBe(false)
    expect(supportsGeneratedAudio('wb-bytedance-t/doubao-seedance-2-5')).toBe(
      false
    )
    expect(supportsGeneratedAudio('bytedance/seedance-2.0-upscale')).toBe(true)
  })

  it('omits the channel for automatic routing and sends an explicit selection', () => {
    const automaticPayload = buildChatCompletionPayload(
      messages,
      DEFAULT_CONFIG,
      DEFAULT_PARAMETER_ENABLED
    )
    const selectedPayload = buildChatCompletionPayload(
      messages,
      { ...DEFAULT_CONFIG, channel_id: 14 },
      DEFAULT_PARAMETER_ENABLED
    )

    expect(automaticPayload).not.toHaveProperty('channel_id')
    expect(selectedPayload.channel_id).toBe(14)
  })
})
