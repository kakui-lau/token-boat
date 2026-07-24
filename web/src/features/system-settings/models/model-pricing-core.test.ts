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

import {
  getSeedanceResolutionPrices,
  isSeedanceVideoModel,
} from './model-pricing-core'

describe('Seedance video pricing detection', () => {
  test('recognizes upstream names and named aliases', () => {
    assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0'), true)
    assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0-fast'), true)
    assert.equal(isSeedanceVideoModel('seedance-fast'), true)
    assert.equal(isSeedanceVideoModel('Seedance Enterprise'), true)
  })

  test('does not classify unrelated models as Seedance video models', () => {
    assert.equal(isSeedanceVideoModel('bytedance-seed/seed-2.0-mini'), false)
    assert.equal(isSeedanceVideoModel('google/veo-3.1'), false)
  })
})

describe('Seedance resolution prices', () => {
  test('derives all supported resolutions from the 720p base price', () => {
    assert.deepEqual(getSeedanceResolutionPrices('0.1512'), [
      { resolution: '480p', multiplier: 4 / 9, price: '0.0672' },
      { resolution: '720p', multiplier: 1, price: '0.1512' },
      { resolution: '1080p', multiplier: 2.25, price: '0.3402' },
      { resolution: '4K', multiplier: 9, price: '1.3608' },
    ])
  })

  test('limits repeating resolution prices to six decimal places', () => {
    assert.equal(getSeedanceResolutionPrices('0.121')[0]?.price, '0.053778')
  })
})
