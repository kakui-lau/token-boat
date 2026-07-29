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
import {
  splitBillingExprAndRequestRules,
  splitBillingExprVersion,
} from '@/features/pricing/lib/billing-expr'
import {
  tryParseVisualConfig,
  type VisualTier,
} from '@/features/pricing/lib/tier-expr'

export type TokenPriceTier = {
  name?: string
  upper_bound?: string
  input_unit_price?: string
  output_unit_price?: string
  cache_read_unit_price?: string
  cache_write_unit_price?: string
  cache_write_1h_unit_price?: string
  image_input_unit_price?: string
  image_output_unit_price?: string
  audio_input_unit_price?: string
  audio_output_unit_price?: string
}

const visualPriceFields: Array<[keyof VisualTier, keyof TokenPriceTier]> = [
  ['input_unit_cost', 'input_unit_price'],
  ['output_unit_cost', 'output_unit_price'],
  ['cache_read_unit_cost', 'cache_read_unit_price'],
  ['cache_create_unit_cost', 'cache_write_unit_price'],
  ['cache_create_1h_unit_cost', 'cache_write_1h_unit_price'],
  ['image_unit_cost', 'image_input_unit_price'],
  ['image_output_unit_cost', 'image_output_unit_price'],
  ['audio_input_unit_cost', 'audio_input_unit_price'],
  ['audio_output_unit_cost', 'audio_output_unit_price'],
]

export function tokenBillingEditorBody(expression: string): string {
  const { schemaVersion, body } = splitBillingExprVersion(expression)
  if (schemaVersion !== 'v2') return body

  const perMillionEnvelope = body.match(
    /^\(\s*([\s\S]+)\s*\)\s*\/\s*1000000\s*$/
  )
  return perMillionEnvelope?.[1]?.trim() ?? body
}

export function buildV2TokenBillingExpression(body: string): string {
  const { schemaVersion, body: expressionBody } = splitBillingExprVersion(body)
  const normalizedBody = expressionBody.trim()
  if (schemaVersion === 'v2') {
    return normalizedBody ? `v2:${normalizedBody}` : ''
  }
  return normalizedBody ? `v2:(${normalizedBody}) / 1000000` : ''
}

export function tokenPriceTiersFromExpression(
  expression: string
): TokenPriceTier[] | null {
  const { billingExpr } = splitBillingExprAndRequestRules(
    tokenBillingEditorBody(expression)
  )
  const config = tryParseVisualConfig(billingExpr)
  if (!config) return null

  return config.tiers.map((tier) => {
    const result: TokenPriceTier = { name: tier.label }
    const upperBound = tier.conditions.find(
      (condition) =>
        condition.var === 'len' &&
        (condition.op === '<' || condition.op === '<=')
    )
    if (upperBound && upperBound.value !== '') {
      result.upper_bound = String(upperBound.value)
    }
    visualPriceFields.forEach(([source, target]) => {
      const value = Number(tier[source])
      if (
        source === 'input_unit_cost' ||
        source === 'output_unit_cost' ||
        value !== 0
      ) {
        result[target] = String(value)
      }
    })
    return result
  })
}

export function synchronizeTokenTierComponents(
  rawComponents: string,
  expression: string
): string {
  let components: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(rawComponents) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      components = parsed as Record<string, unknown>
    }
  } catch {
    components = {}
  }

  const tiers = tokenPriceTiersFromExpression(expression)
  if (tiers) {
    components.tiers = tiers
  } else {
    delete components.tiers
  }
  return JSON.stringify(components, null, 2)
}
