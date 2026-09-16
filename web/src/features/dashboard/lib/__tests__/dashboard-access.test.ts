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
import { describe, expect, it } from 'vitest'

import { ROLE } from '@/lib/roles'

import {
  canAccessLegacyDashboard,
  canAccessLegacyDashboardSection,
} from '../dashboard-access'

describe('legacy dashboard access', () => {
  it.each([
    ['missing user', undefined, false],
    ['guest', ROLE.GUEST, false],
    ['regular user', ROLE.USER, true],
    ['administrator', ROLE.ADMIN, true],
    ['super administrator', ROLE.SUPER_ADMIN, true],
  ])('%s access is %s', (_label, role, expected) => {
    expect(canAccessLegacyDashboard(role)).toBe(expected)
  })

  it.each([
    ['regular user can open overview', ROLE.USER, 'overview', true],
    ['regular user can open model analytics', ROLE.USER, 'models', true],
    ['regular user can open flow analytics', ROLE.USER, 'flow', true],
    ['regular user cannot open user analytics', ROLE.USER, 'users', false],
    ['administrator can open user analytics', ROLE.ADMIN, 'users', true],
    ['guest cannot open overview', ROLE.GUEST, 'overview', false],
  ])('%s', (_label, role, section, expected) => {
    expect(canAccessLegacyDashboardSection(role, section)).toBe(expected)
  })
})
