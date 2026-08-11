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
