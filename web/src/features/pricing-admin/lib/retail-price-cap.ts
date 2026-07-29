import type { OfficialPriceVersion, PurchasePriceVersion } from '../types'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { readPriceComponents, type PriceRule } from './price-components'

function isHigher(
  purchasePrice: string,
  officialPrice: string,
  factor: number
) {
  if (!purchasePrice || !officialPrice) {
    return false
  }
  const retail =
    Math.ceil(Number(purchasePrice) * factor * 100_000) / 100_000
  const official = Number(officialPrice)
  return (
    Number.isFinite(retail) && Number.isFinite(official) && retail >= official
  )
}

export function retailPriceExceedsOfficial(
  purchase: PurchasePriceVersion,
  official: OfficialPriceVersion,
  factor: number
): boolean {
  if (
    purchase.currency !== official.currency ||
    !Number.isFinite(factor) ||
    factor < 0
  ) {
    return false
  }

  const purchaseComponents = readPriceComponents(purchase.price_components)
  const officialComponents = readPriceComponents(official.price_components)
  const purchaseRules = Array.isArray(purchaseComponents.rules)
    ? (purchaseComponents.rules as PriceRule[])
    : []
  const officialRules = Array.isArray(officialComponents.rules)
    ? (officialComponents.rules as PriceRule[])
    : []

  if (purchaseRules.length > 0 && officialRules.length > 0) {
    return purchaseRules.some((purchaseRule, index) => {
      const officialRule =
        officialRules.find(
          (rule) => Boolean(purchaseRule.id) && rule.id === purchaseRule.id
        ) ?? officialRules[index]
      return isHigher(
        purchaseRule.unit_price || '',
        officialRule?.unit_price || '',
        factor
      )
    })
  }

  const componentKeys = [
    'input_unit_price',
    'output_unit_price',
    'cache_read_unit_price',
    'cache_write_unit_price',
    'image_input_unit_price',
    'image_output_unit_price',
    'audio_input_unit_price',
    'audio_output_unit_price',
  ]
  return componentKeys.some((key) => {
    const purchaseValue =
      String(purchaseComponents[key] ?? '') ||
      String(purchase[key as keyof PurchasePriceVersion] ?? '')
    return isHigher(
      purchaseValue,
      String(officialComponents[key] ?? ''),
      factor
    )
  })
}
