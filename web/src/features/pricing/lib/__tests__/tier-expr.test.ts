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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parseTiersFromExpr, splitBillingExprVersion } from '../billing-expr'
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

describe('tier pricing expression parsing', () => {
  test('parses explicit versions without breaking legacy expressions', () => {
    assert.deepEqual(splitBillingExprVersion(' v1:tier("base", p * 1) '), {
      schemaVersion: 'v1',
      body: 'tier("base", p * 1)',
    })
  })

  test('extracts prices from grouped input and output terms', () => {
    const tiers = parseTiersFromExpr(
      'param("metadata.billing_has_video") == true ? tier("video_480p_720p", (p + c) * 3.835616) : tier("text_480p_720p", (p + c) * 6.986301)'
    )

    assert.deepEqual(
      tiers.map(({ label, inputPrice, outputPrice }) => ({
        label,
        inputPrice,
        outputPrice,
      })),
      [
        {
          label: 'video_480p_720p',
          inputPrice: 3.835616,
          outputPrice: 3.835616,
        },
        {
          label: 'text_480p_720p',
          inputPrice: 6.986301,
          outputPrice: 6.986301,
        },
      ]
    )
  })

  test('keeps grouped and individually priced token terms', () => {
    const [tier] = parseTiersFromExpr(
      'tier("media", (p + c) * 2.5 + cr * 0.25 + img_o * 30)'
    )

    assert.equal(tier?.inputPrice, 2.5)
    assert.equal(tier?.outputPrice, 2.5)
    assert.equal(tier?.cacheReadPrice, 0.25)
    assert.equal(tier?.imageOutputPrice, 30)
  })
})
