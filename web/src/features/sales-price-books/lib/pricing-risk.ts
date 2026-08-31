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
import type { TFunction } from 'i18next'

export function pricingRiskLabel(code: string, t: TFunction) {
  if (code === 'below_minimum_margin') {
    return t('Below minimum margin')
  }
  if (code === 'channel_below_minimum_margin') {
    return t('At least one channel is below the minimum margin')
  }
  if (code === 'increase_cap_exceeded') {
    return t('Increase cap exceeded')
  }
  if (code === 'missing_purchase_price') {
    return t('Missing purchase price')
  }
  if (code === 'model_removed') {
    return t('Model removed')
  }
  if (code === 'unsupported_cost_basis') {
    return t('Selected purchase prices cannot be combined safely')
  }
  if (code === 'channel_model_policy_changed') {
    return t('Channel model special parameters changed')
  }
  return code || t('Requires review')
}
