/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

import {
  storedMultiplierToDiscountTenths,
  storedRateToPercentage,
} from './rate-format'

function formatDecimal(value: string, maximumFractionDigits = 4): string {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return value
  }
  return parsed
    .toFixed(maximumFractionDigits)
    .replace(/0+$/, '')
    .replace(/\.$/, '')
}

export function formatPurchaseDiscount(
  storedMultiplier: string,
  t: TFunction
): string {
  if (!storedMultiplier) {
    return '—'
  }
  return t('{{discount}}/10 ({{percentage}} of official price)', {
    discount: formatDecimal(storedMultiplierToDiscountTenths(storedMultiplier)),
    percentage: `${formatDecimal(storedRateToPercentage(storedMultiplier))}%`,
  })
}
