import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { evalExprLocally, type ExtraTokenValues } from '../tier-expr'

const emptyExtraTokens: ExtraTokenValues = {
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  cacheCreate1hTokens: 0,
  imageTokens: 0,
  imageOutputTokens: 0,
  audioInputTokens: 0,
  audioOutputTokens: 0,
}

describe('request-aware expression preview', () => {
  test('supports has without reporting an undefined function', () => {
    const result = evalExprLocally(
      'has("video_url", "video") ? tier("video", (p + c) * 16) : tier("text", (p + c) * 26)',
      100,
      50,
      emptyExtraTokens
    )

    assert.equal(result.error, null)
    assert.equal(result.matchedTier, 'video')
    assert.equal(result.cost, 2400)
  })

  test('treats param and header as missing when no sample request is available', () => {
    const result = evalExprLocally(
      'has(param("metadata.content"), "video_url") || header("x-mode") == "video" ? tier("video", p * 16) : tier("text", p * 26)',
      100,
      0,
      emptyExtraTokens
    )

    assert.equal(result.error, null)
    assert.equal(result.matchedTier, 'text')
    assert.equal(result.cost, 2600)
  })
})
