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
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { SettingsPageProvider } from '../../components/settings-page-context'
import { BasicAuthSection } from '../basic-auth-section'

const mutateAsync = vi.fn().mockResolvedValue({ success: true, message: '' })

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: () => ({ mutateAsync, isPending: false }),
}))

beforeEach(() => {
  mutateAsync.mockClear()
})

afterEach(cleanup)

test('saves the EVM wallet sign-in option from authentication settings', async () => {
  const actionsContainer = document.createElement('div')
  document.body.append(actionsContainer)

  render(
    <SettingsPageProvider actionsContainer={actionsContainer}>
      <BasicAuthSection
        defaultValues={{
          PasswordLoginEnabled: true,
          EVMWalletAuthEnabled: true,
          PasswordRegisterEnabled: true,
          EmailVerificationEnabled: false,
          RegisterEnabled: true,
          EmailDomainRestrictionEnabled: false,
          EmailAliasRestrictionEnabled: false,
          EmailDomainWhitelist: '',
        }}
      />
    </SettingsPageProvider>
  )

  const walletSwitch = screen.getByRole('switch', {
    name: 'EVM Wallet Sign-in',
  })
  expect(walletSwitch).toBeChecked()

  fireEvent.click(walletSwitch)
  expect(walletSwitch).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'EVMWalletAuthEnabled',
      value: false,
    })
  )

  actionsContainer.remove()
})
