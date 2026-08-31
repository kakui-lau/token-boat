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
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ProfileHeader } from '../components/profile-header'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
}))

describe('ProfileHeader actions', () => {
  afterEach(cleanup)

  test('shows recharge beside the current balance', () => {
    render(
      <ProfileHeader
        loading={false}
        profile={{
          id: 1,
          username: 'profile-user',
          display_name: 'Profile User',
          role: 1,
          group: 'default',
          quota: 100,
          used_quota: 20,
          request_count: 3,
          status: 1,
          aff_count: 0,
          aff_quota: 0,
          aff_history_quota: 0,
          created_time: 1,
        }}
      />
    )

    expect(screen.getByRole('link', { name: 'Recharge' })).toHaveAttribute(
      'href',
      '/recharge'
    )
  })
})
