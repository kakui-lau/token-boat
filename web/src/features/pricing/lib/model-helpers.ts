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
import { ENDPOINT_TYPES, EXCLUDED_GROUPS, FILTER_ALL } from '../constants'
import type { PricingModel, PublicPriceSummary } from '../types'

// ----------------------------------------------------------------------------
// Model Helper Utilities
// ----------------------------------------------------------------------------

/**
 * Get available groups for a model
 */
export function getAvailableGroups(
  model: PricingModel,
  usableGroup: Record<string, string>
): string[] {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []

  if (modelEnableGroups.includes('all')) {
    return Object.keys(usableGroup).filter(
      (group) => !EXCLUDED_GROUPS.includes(group)
    )
  }

  return Object.keys(usableGroup)
    .filter((g) => !EXCLUDED_GROUPS.includes(g))
    .filter((g) => modelEnableGroups.includes(g))
}

/**
 * Read a configured group ratio while preserving valid zero ratios.
 */
export function getConfiguredGroupRatio(
  groupRatio: Record<string, number>,
  group: string
): number {
  const ratio = groupRatio[group]
  return typeof ratio === 'number' && Number.isFinite(ratio) ? ratio : 1
}

/**
 * Resolve the group ratio used by model square summary prices.
 *
 * When no specific group is selected, the model square shows the best price
 * available to the viewer. When a group filter is active, it shows that
 * group's price instead.
 */
export function getDisplayGroupRatio(
  model: PricingModel,
  selectedGroup?: string
): number {
  const modelEnableGroups = Array.isArray(model.enable_groups)
    ? model.enable_groups
    : []
  const groupRatio = model.group_ratio || {}

  if (
    selectedGroup &&
    selectedGroup !== FILTER_ALL &&
    modelEnableGroups.includes(selectedGroup)
  ) {
    return getConfiguredGroupRatio(groupRatio, selectedGroup)
  }

  if (modelEnableGroups.length === 0) {
    return 1
  }

  let minRatio = Number.POSITIVE_INFINITY

  for (const group of modelEnableGroups) {
    const ratio = groupRatio[group]
    if (
      typeof ratio === 'number' &&
      Number.isFinite(ratio) &&
      ratio < minRatio
    ) {
      minRatio = ratio
    }
  }

  return minRatio === Number.POSITIVE_INFINITY ? 1 : minRatio
}

/**
 * Resolve the structured sales-price summary for the selected model-square group.
 * The unfiltered view uses the cross-group component minimum returned by the
 * backend; a concrete group must never silently fall back to another group.
 */
export function getDisplayedSalesPrice(
  model: PricingModel,
  selectedGroup?: string
): PublicPriceSummary | undefined {
  if (selectedGroup && selectedGroup !== FILTER_ALL) {
    return model.sales_prices_by_group?.[selectedGroup]
  }
  return model.lowest_price
}

export function isModelAvailableForGroup(
  model: PricingModel,
  selectedGroup?: string
): boolean {
  if (!model.available) return false
  if (!selectedGroup || selectedGroup === FILTER_ALL) return true
  if (Array.isArray(model.pricing_groups)) {
    return model.pricing_groups.includes(selectedGroup)
  }
  return Boolean(model.sales_prices_by_group?.[selectedGroup])
}

/**
 * Replace model placeholder in endpoint path
 */
export function replaceModelInPath(path: string, modelName: string): string {
  return path.replaceAll('{model}', modelName)
}

/**
 * Check if model is token-based pricing
 */
export function isTokenBasedModel(model: PricingModel): boolean {
  const billingMode =
    model.lowest_price?.billing_mode || model.official_price?.billing_mode
  return billingMode === 'token'
}

/**
 * Check if the model is an LLM-style text generation model.
 *
 * We use a DENY-list approach because OpenRouter/Sub2API-style channels default
 * every model to `endpointType=openai` regardless of what it actually serves,
 * so a WHITELIST on text endpoints lets image/video/embedding models slip in.
 *
 * Model is considered NON-text LLM (excluded) if ANY of these hold:
 *   1. The active structured price is not token-based.
 *   2. Declares any non-text endpoint (image-generation, openai-video,
 *      embeddings, jina-rerank). Takes priority over text endpoints because
 *      the backend always injects `openai` alongside the real type.
 *   3. Matches any known non-text keyword in its model_name (seedance,
 *      gpt-image, dall-e, flux, whisper, tts, moderation, embed, rerank,
 *      upscale, ...). Acts as a safety net when metadata is stale.
 */
const EXPLICIT_NON_LLM_ENDPOINTS: Set<string> = new Set([
  ENDPOINT_TYPES.IMAGE_GENERATION,
  ENDPOINT_TYPES.OPENAI_VIDEO,
  ENDPOINT_TYPES.EMBEDDINGS,
  ENDPOINT_TYPES.JINA_RERANK,
])

const NON_LLM_NAME_KEYWORDS: ReadonlyArray<string> = [
  'dall-e',
  'dalle',
  'gpt-image',
  'gpt-image-',
  'seedance',
  'flux.1',
  'flux-',
  'imagen-',
  'sd-',
  'stable-diffusion',
  'stable_diffusion',
  'upscale',
  'whisper',
  'tts-',
  '-tts',
  'speech',
  'transcribe',
  'transcription',
  'translation',
  'moderation',
  'embed',
  'embedding',
  'rerank',
  're-rank',
  'video',
  'image',
]

export function isTextLLMModel(model: PricingModel): boolean {
  if (!isTokenBasedModel(model)) return false

  const endpoints = Array.isArray(model.supported_endpoint_types)
    ? model.supported_endpoint_types
    : []
  if (endpoints.some((ep) => EXPLICIT_NON_LLM_ENDPOINTS.has(ep))) return false

  const name = (model.model_name ?? '').toLowerCase()
  if (name === '') return true
  for (const kw of NON_LLM_NAME_KEYWORDS) {
    if (name.includes(kw)) return false
  }
  return true
}

/**
 * Keep the public availability dashboard aligned with models users can
 * actually purchase and route to right now.
 */
export function isModelEligibleForAvailabilityMetrics(
  model: PricingModel
): boolean {
  if (!isTextLLMModel(model)) return false
  if (!model.available || model.availability_status !== 'available') {
    return false
  }
  if (
    !Array.isArray(model.pricing_groups) ||
    model.pricing_groups.length === 0
  ) {
    return false
  }
  return (model.lowest_price?.items.length ?? 0) > 0
}
