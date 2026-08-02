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
// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { PricingModel } from '../../types'
import { ModelAvailabilityBadge } from '../model-availability-badge'
import { ModelBillingModeBadge } from '../model-billing-mode-badge'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
afterEach(cleanup)

const baseModel: PricingModel = {
  model_name: 'catalog-model',
  quota_type: 0,
  model_ratio: 1,
  completion_ratio: 1,
  enable_groups: [],
  available: false,
  availability_status: 'price_unavailable',
}

describe('model availability badge', () => {
  test('shows unavailable state when pricing is incomplete', () => {
    render(
      <>
        <ModelAvailabilityBadge model={baseModel} />
        <ModelBillingModeBadge model={baseModel} />
      </>
    )

    expect(screen.getByText('Not available')).toBeVisible()
    expect(screen.getByText('Not configured')).toBeVisible()
  })

  test('shows available state when routing and pricing are complete', () => {
    render(
      <ModelAvailabilityBadge
        model={{
          ...baseModel,
          available: true,
          availability_status: 'available',
        }}
      />
    )

    expect(screen.getByText('Available')).toBeVisible()
  })

  test('shows unavailable when the selected group has no retail price', () => {
    render(
      <ModelAvailabilityBadge
        selectedGroup='vip'
        model={{
          ...baseModel,
          available: true,
          availability_status: 'available',
          retail_prices_by_group: {},
        }}
      />
    )

    expect(screen.getByText('Not available')).toBeVisible()
  })

  test('shows expression-only V2 pricing as available for its priced group', () => {
    render(
      <ModelAvailabilityBadge
        selectedGroup='vip'
        model={{
          ...baseModel,
          available: true,
          availability_status: 'available',
          pricing_source: 'v2_dynamic',
          pricing_groups: ['vip'],
        }}
      />
    )

    expect(screen.getByText('Available')).toBeVisible()
  })
})
