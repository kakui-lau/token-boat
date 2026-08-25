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
import { RoutingReliabilitySection } from '../routing-reliability-section'

const mutateAsync = vi.fn().mockResolvedValue({ success: true, message: '' })

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: () => ({ mutateAsync, isPending: false }),
}))

beforeEach(() => {
  mutateAsync.mockClear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(cleanup)

test('saves the disabled circuit monitoring option from the routing settings', async () => {
  const actionsContainer = document.createElement('div')
  document.body.append(actionsContainer)

  render(
    <SettingsPageProvider actionsContainer={actionsContainer}>
      <RoutingReliabilitySection
        defaultValues={{
          RetryTimes: 0,
          ChannelDisableThreshold: '',
          AutomaticDisableChannelEnabled: false,
          AutomaticEnableChannelEnabled: false,
          AutomaticDisableKeywords: '',
          AutomaticDisableStatusCodes: '401',
          AutomaticRetryStatusCodes: '500-599',
          'monitor_setting.auto_test_channel_enabled': false,
          'monitor_setting.auto_test_channel_minutes': 10,
          'monitor_setting.channel_test_mode': 'scheduled_all',
          'monitor_setting.circuit_breaker_enabled': true,
        }}
      />
    </SettingsPageProvider>
  )

  const circuitSwitch = screen.getByRole('switch', {
    name: 'Enable circuit monitoring',
  })
  expect(circuitSwitch).toBeChecked()

  fireEvent.click(circuitSwitch)
  expect(circuitSwitch).not.toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

  await waitFor(() =>
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'monitor_setting.circuit_breaker_enabled',
      value: false,
    })
  )

  actionsContainer.remove()
})
