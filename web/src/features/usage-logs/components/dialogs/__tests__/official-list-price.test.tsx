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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { DetailsDialog } from '../details-dialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

test('shows the settled official list price amount to administrators', () => {
  render(
    <DetailsDialog
      open
      onOpenChange={() => undefined}
      isAdmin
      log={{
        id: 1,
        user_id: 1,
        created_at: 1,
        type: 2,
        content: '',
        username: 'admin',
        token_name: 'token',
        model_name: 'model',
        quota: 800000,
        prompt_tokens: 1000,
        completion_tokens: 100,
        use_time: 1,
        is_stream: false,
        channel: 1,
        channel_name: 'channel',
        token_id: 1,
        group: 'default',
        ip: '',
        other: JSON.stringify({
          billing_mode: 'sales_price_book',
          customer_final_quota: 800000,
          admin_info: {
            official_price_version_id: 12,
            estimated_official_amount_usd: '1.5',
            official_amount_usd: '1.25',
          },
        }),
        request_id: 'request-1',
        upstream_request_id: '',
        task_id: '',
      }}
    />
  )

  expect(screen.getByText('Official list price amount')).toBeInTheDocument()
  expect(screen.getByText(/\$1\.25/)).toBeInTheDocument()
  expect(
    screen.queryByText('Estimated official list price amount')
  ).not.toBeInTheDocument()
})
